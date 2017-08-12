import path from 'path';
import frontmatter from 'front-matter';
import globby from 'globby';
import json from 'load-json-file';
import {merge} from 'lodash';
import exists from 'path-exists';
import remark from 'remark';
import find from 'unist-util-find';
import * as sander from 'sander';
import throat from 'throat';

import getEnvironments from './get-environments';

const DEFAULT_MANIFEST = {
	version: '1.0.0',
	flag: 'alpha',
	options: {}
};

export async function getPatterns(base) {
	const resolve = path.resolve.bind(null, base);
	const cwd = resolve('.');
	const read = f => json(resolve(f));

	if (!await exists(cwd)) {
		return [];
	}

	const files = await globby(`**/pattern.json`, {cwd});

	const envs = (await getEnvironments(cwd))
		.filter(env => env.display)
		.map(env => env.name);

	const patterns = await Promise.all(files
		.filter(file => ['@environments', '@docs'].every(i => !file.startsWith(i)))
		.map(async file => {
			const data = await read(file);
			data.displayName = data.displayName || data.name || null;
			const id = file.split(path.sep).join('/');
			const manifest = {...DEFAULT_MANIFEST, ...data};
			return {id, path: file, manifest, envs};
		}));

	return patterns.map(pattern => {
		const id = path.dirname(pattern.id);

		pattern.dependencies = getDependencies(id, {pattern, pool: patterns, key: 'patterns'});
		pattern.demoDependencies = getDependencies(id, {pattern, pool: patterns, key: 'demoPatterns'});
		pattern.dependents = getDependents(id, {pool: patterns, key: 'patterns'});
		pattern.demoDependents = getDependents(id, {pool: patterns, key: 'demoPatterns'});

		return pattern;
	});
}

export async function getPatternTree(base) {
	return treeFromPaths(await getPatterns(base));
}

function getDependencies(id, config) {
	return Object.values(config.pattern.manifest[config.key] || {});
}

function getDependents(id, config) {
	return config.pool.reduce((d, p) => {
		const dependents = Object.values(p.manifest[config.key] || {});
		if (dependents.includes(id)) {
			return [...d, ...dependents];
		}
		return d;
	}, []);
}

async function treeFromPaths(files) {
	const tree = {
		id: 'root',
		children: []
	};

	await Promise.all(files.map(throat(1, async file => {
		const parts = file.path.split('/');
		let level = tree;

		return await Promise.all(parts.map(throat(1, async (id, i) => {
			const existing = level.children.find(c => c.name === id);
			const n = parts[i + 1];
			const itemPath = parts.slice(0, i + 1);

			if (!n) {
				return null;
			}

			const type = getType(n || id);
			const name = getName(id, file.manifest);

			if (existing) {
				level = existing;
				return null;
			}

			const contentsPath = path.resolve(...['./patterns', ...itemPath, 'readme.md']);
			const contents = await exists(contentsPath) ? String(await sander.readFile(contentsPath)) : '';
			const ast = remark().parse(contents);
			const first = find(ast, {type: 'heading', depth: 1});
			const front = typeof contents === 'string' ? frontmatter(contents).attributes : {};
			const manifest = merge({}, DEFAULT_MANIFEST, front);
			manifest.name = first ? first.children[0].value : name;
			manifest.displayName = manifest.displayName || manifest.name;

			const item = {
				contents,
				name,
				manifest: type === 'folder' ? manifest : file.manifest,
				id: parts.slice(0, i + 1).join('/'),
				path: itemPath,
				type
			};

			level.children.push(item);

			if (item.type === 'folder') {
				item.children = [];
				level = item;
			} else {
				item.dependents = file.dependents;
				item.demoDependents = file.demoDependents;
				item.dependencies = file.dependencies;
				item.demoDependencies = file.demoDependencies;
				item.envs = file.envs;
			}

			return null;
		})));
	})));

	return tree;
}

function getName(basename, manifest) {
	if (basename === 'pattern.json') {
		return manifest.name;
	}
	return basename;
}

function getType(basename) {
	if (basename === 'pattern.json') {
		return 'pattern';
	}
	return 'folder';
}
