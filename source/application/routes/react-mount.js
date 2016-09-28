import {
	resolve
} from 'path';

import {merge} from 'lodash';

import getMountTransformChain from '../../library/utilities/get-mount-transform-chain';
import getPatterns from '../../library/utilities/get-patterns';
import getStaticCacheItem from '../../library/utilities/get-static-cache-item';

export default function (application) {
	const patterns = application.configuration.patterns || {};
	const transforms = application.configuration.transforms;
	const jsxFormat = application.configuration.patterns.formats.jsx;
	const mountTransforms = getMountTransformChain(jsxFormat, transforms);
	const componentFormat = {
		name: 'Component',
		transforms: mountTransforms
	};

	// Create one-off special config
	const config = merge(
		{},
		{
			transforms,
			patterns
		},
		{
			transforms: { // eslint-disable-line quote-props
				react: {
					inFormat: 'jsx',
					outFormat: 'js',
					resolveDependencies: false,
					convertDependencies: true
				},
				'react-mount': {
					inFormat: 'js',
					outFormat: 'js'
				},
				browserify: {
					inFormat: 'js',
					outFormat: 'js'
				}
			},
			patterns: {
				formats: {
					jsx: componentFormat,
					html: componentFormat
				}
			}
		}
	);

	return async function() {
		this.type = 'js';

		// collect some base data
		const cwd = application.runtime.patterncwd || application.runtime.cwd;
		const base = resolve(cwd, config.patterns.path);
		const mountableCacheRoot = resolve(cwd, '.cache', 'react-mount');

		// special cache for react-mount
		// TODO: remove this when patterns.formats[ext] support arrays
		const cached = await getStaticCacheItem({
			id: this.params.id,
			base: mountableCacheRoot,
			cache: application.cache,
			extension: 'js',
			stream: true,
			filters: {
				environments: [this.query.environment].filter(Boolean)
			}
		});

		if (cached) {
			this.body = cached;
			return;
		}

		// get the react-transformed patterns
		const patterns = await getPatterns({
			id: this.params.id,
			config,
			base,
			factory: application.pattern.factory,
			transforms: application.transforms,
			log: application.log
		}, application.cache);

		const pattern = patterns[0];

		if (!pattern || !pattern.results.Component) {
			this.throw(404);
		}

		const result = pattern.results.Component.buffer;
		this.body = result;
	};
}