export default {
	'browserify': {
		'opts': {
			'debug': false
		},
		'transforms': {
			'uglifyify': {
				//'enabled': true
			}
		}
	},
	'less': {
		'opts': {
			'compress': true,
			'sourceMap': false
		},
		'plugins': {
			'clean-css': {
				'enabled': true
			}
		}
	}
};