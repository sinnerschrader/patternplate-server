import {join} from 'path';
import pascalCase from 'pascal-case';
import {transform} from 'babel-core';
import * as React from 'react';

export default function createReactRendererFactory(application) {
	const config = application.configuration.transforms['react-to-markup'] || {};

	return async function renderReactComponent(file, demo) {
		file.buffer = renderMarkup(file.buffer.toString('utf-8'));
		if (file.demoBuffer) {
			file.demoBuffer = renderMarkup(file.demoBuffer.toString('utf-8'))
		}
		file.in = config.inFormat;
		file.out = config.outFormat;
		return file;
	}
}

function renderMarkup(source) {
	// Convert to es5...
	let result = transform(source, {});

	// ...then 'require' module...
	let moduleScope = {exports:{}};
	let fn = new Function('module', 'exports', 'require', result.code);
	fn(moduleScope, moduleScope.exports, require);

	// ...finally render markup
	return React.renderToStaticMarkup(React.createElement(moduleScope.exports));
}
