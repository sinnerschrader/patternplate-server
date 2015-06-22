import {resolve, dirname, basename, extname} from 'path';

import getPatterns from '../../library/utilities/get-patterns';
import getWrapper from '../../library/utilities/get-wrapper';

import layout from '../layouts';

export default function patternRouteFactory (application, configuration) {
	let patterns = application.configuration[configuration.options.key] || {};
	let transforms = application.configuration.transforms || {};
	const config = { patterns, transforms };

	return async function patternRoute () {
		let cwd = application.runtime.patterncwd || application.runtime.cwd;
		let basePath = resolve(cwd, config.patterns.path);
		let id = this.params.id;

		let patternResults;

		let base;
		let resultName;
		let type = this.accepts('text', 'json', 'html');
		let extension = extname(this.path);

		if (extension) {
			type = extension.slice(1);
		}

		if (extension) {
			base = basename(this.path, extension);
			let format = config.patterns.formats[type] || {};
			resultName = format.name || '';

			if (!resultName) {
				this.throw(404);
			}

			id = dirname(id);
		}

		if (application.cache && application.runtime.env === 'production') {
			patternResults = application.cache.get(id);
		}

		if (!patternResults) {
			try {
				patternResults = await getPatterns(id, basePath, config, application.pattern.factory, application.transforms);
			} catch (err) {
				this.throw(500, err);
			}
		}

		if (application.cache && application.runtime.env === 'production') {
			application.cache.set(id, patternResults.results);

			patternResults.results.forEach(function cacheResponseItems (resp) {
				application.cache.set(resp.id, resp);
			});
		}

		this.set('Last-Modified', patternResults.mtime.toUTCString());
		this.set('Cache-Control', `maxage=${configuration.options.maxage | 0}`);
		let result = patternResults.results.length <= 1 ? patternResults.results[0] : patternResults.results;

		switch (type) {
			case 'json':
				break;
			default:
				if (Array.isArray(result)) {
					this.throw(404);
				}
				this.type = type;
		}

		switch(type) {
			case 'json':
				this.body = result;
				break;
			case 'css':
			case 'js':
				let environment = result.results[base];

				if (!environment) {
					this.throw(404);
				}

				let file = environment[resultName];

				if (!file) {
					this.throw(404);
				}

				this.body = file.demoBuffer || file.buffer;
				break;
			default:
				let templateData = {
					'title': id,
					'style': [],
					'script': [],
					'markup': []
				};

				for (let environmentName of Object.keys(result.results)) {
					let environment = result.results[environmentName];
					let envConfig = result.environments[environmentName].manifest || {};
					let wrapper = getWrapper(envConfig['conditional-comment']);
					let blueprint = {'environment': environmentName, 'content': '', wrapper};

					for (let resultType of Object.keys(environment)) {
						let result = environment[resultType];
						let templateKey = resultType.toLowerCase();
						let content = result.demoBuffer || result.buffer;
						let uri = `${this.path}/${environmentName}.${result.out}`;
						let templateSectionData = Object.assign({}, blueprint, {content, uri});

						templateData[templateKey] = Array.isArray(templateData[templateKey]) ?
							templateData[templateKey].concat([templateSectionData]) :
							[templateSectionData];
					}
				}

				this.body = layout(templateData);
				break;
		}
	};
}
