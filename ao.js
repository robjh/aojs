(function () {

	var when_ready = [];

	var module_factory = {};

	var include = (function(identifier, path, ao) {
		for (var i = 0, l = module_factory[identifier][0].length ; i < l ; ++i) {
			if (!ao.module_has(module_factory[identifier][0][i]))
				include(module_factory[identifier][0][i], null, ao);
		}
		module_factory[identifier][1](ao);
		ao.modules.push(identifier);
	});

	window.ao_get = function(argv) {
		argv = argv || {};
		var ao = {
			modules: []
		};

		ao.include = (function(identifier, path) {
			include(identifier, path, ao);
			return ao;
		});
		ao.module_has = (function(identifier) {
			return ao.modules.indexOf(identifier) >= 0;
		});
		ao.ready = (function(callback) {
			when_ready.push(callback);
			return ao;
		});

		if (argv.include) {
			ao.include(argv.include);
		}
		if (argv.ready) {
			ao.ready(argv.ready);
		}

		return ao;
	};

	window.ao_module = function(identifier, requirements, factory) {
		module_factory[identifier] = [requirements, factory];
	};

//	window.onload = (function() {
//		for (var i = 0, l = when_ready.length ; i < l ; ++i) {
//			when_ready[i]();
//		}
//	});
	document.addEventListener("DOMContentLoaded", function(event) {
		for (var i = 0, l = when_ready.length ; i < l ; ++i) {
			when_ready[i]();
		}
	});
	
}());

ao_module('util', [], function(ao) {
	ao.jQuery_has = (typeof(jQuery) !== 'undefined');
	ao.element_raw = (function(node) {
		return (ao.jQuery_has && node instanceof jQuery) ? node.get(0)
		                                                 : node;
	});

	// Find the endieness of the system, so the server can send us
	// compatible binary data. To handle a mixed endian system, we can request
	// numeric data from the server. However, this is an extreme edge case.
	// This function is authored by Ryan on stackoverflow
	//   http://stackoverflow.com/questions/7869752
	var endian = {
		LITTLE: 0,
		BIG: 1,
		MIXED: 2
	};
	var endianness = (function() {
		var a = new ArrayBuffer(4);
		var b = new Uint8Array(a);
		var c = new Uint32Array(a);
		b[0] = 0xa1;
		b[1] = 0xb2;
		b[2] = 0xc3;
		b[3] = 0xd4;
		if (c[0] == 0xd4c3b2a1) return endian.LITTLE;
		if (c[0] == 0xa1b2c3d4) return endian.BIG;
		return endian.MIXED;
	})();
	
	
	// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding
	//   #Appendix.3A_Decode_a_Base64_string_to_Uint8Array_or_ArrayBuffer
	var base64tobuffer = (function(sBase64, nBlocksSize) {

		var b64ToUint6 = (function(nChr) {
			return nChr > 64 && nChr <  91 ? // A-Z
			       nChr - 65
			     : nChr > 96 && nChr < 123 ? // a-z
			       nChr - 71
			     : nChr > 47 && nChr <  58 ? // 0-9
			       nChr +  4
			     : nChr === 43 ? // +
			       62
			     : nChr === 47 ? // /
			       63
			     :
			       0;
		});
        
		var sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, "");
		var nInLen  = sB64Enc.length;
		var nOutLen = nBlocksSize ?
		              Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize
		            : nInLen * 3 + 1 >> 2;
		var buffer  = new ArrayBuffer(nOutLen);
		var taBytes = new Uint8Array(buffer);

		for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
			nMod4 = nInIdx & 3;
			nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 6 * (3 - nMod4);
			if (nMod4 === 3 || nInLen - nInIdx === 1) {
				for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
					taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
				}
				nUint24 = 0;
			}
		}

		return buffer;
	});

	var dom_node = (function(type, params) {
		var node = document.createElement(type);
		if (params) dom_apply(node, params);
		return node;
	});

	var dom_apply = (function(element, params) {
		for (var i in params) {
			if (i == "text") {
				element.appendChild(document.createTextNode(params[i]));
			} else if (i == "data") {
				for (var j in params[i]) {
					element.dataset[j] = params[i][j];
				}
			} else if (typeof(element[i]) == 'function') {
				if (params[i] instanceof Array) {
					for (var j = 0, l = params[i].length ; j < l ; ++j) {
						element[i](params[i][j]);
					}
				} else {
					element[i](params[i]);
				}
			} else {
				element[i] = params[i];
			}
		}
	});

	var state_machine = (function(argv, p) {
		argv     = argv || {};
		p        = p    || {};

		if (argv.bind) {
			var self = function() {
				while (argv.states[p.state].bind(argv.bind)(self) == p.CONTINUE);
			};
		} else {
			var self = function() {
				while (argv.states[p.state](self) == p.CONTINUE);
			};
		}
		p.state = p.state || Object.keys(argv.states)[0];
		p.YIELD    = 0;
		p.CONTINUE = 1;

		self.yield = (function(state_name) {
			if (state_name !== undefined) p.state = state_name;
			return p.YIELD;
		});
		self.continue = (function(state_name) {
			if (state_name !== undefined) p.state = state_name;
			return p.CONTINUE;
		});
		self.fnc = {
			yield:     self.yield,
			continue:  self.continue
		};

		return self;
	});

	var cookies = (function(argv, p) {
		argv     = argv || {};
		p        = p    || {};
		var self = {};
		
		self.reload = (function() {
			self.store = {};
			p.expires = {};
			for (var cookie in cookies._store) {
				self.store[cookie] = cookies._store[cookie];
			}
			self.length = cookies._length; 
		});
		self.reload();
		
		self.set = (function(name, value, expires) {
			if (expires) {
				if (typeof expires == "string") {
					var data = expires.match(/^\+?([1-9][0-9]*(?:\.[0-9]+)?)([smhdwy])$/);
					if (!data) {
						console.error("didnt understand \"" + expires + "\" in expires parameter. Not setting cookie.");
						return false;
					}
					expires = data[1];
					switch (data[2]) {
						case 'y': expires *= 52;
						case 'w': expires *= 7;
						case 'd': expires *= 24;
						case 'h': expires *= 60;
						case 'm': expires *= 60;
						case 's': expires *= 1000;
					}
				}
				p.expires[name] = expires;
			}
			self.store[name] = value;
			++self.length;
			return true;
		});
		
		self.validate = (function(value) {
			return /^[A-Za-z0-9 !#$%&'()*+-./:<=>?@\[\]^_`{|}~]+$/.test(value);
		});
		
		self.remove = (function(name) {
			delete self.store[name];
			--self.length;
			if (cookies._store[name]) {
				document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
				delete cookies._store[name];
				--cookies._length;
			}
		});
		
		self.remove_all = (function() {
			for (var cookie in self.store) {
				self.remove(cookie);
			}
		});
		
		self.commit = (function() {
			for (var cookie in self.store) {
				if (
					!cookies._store[cookie]                      ||
					cookies._store[cookie] != self.store[cookie] ||
					p.expires[cookie]
				) {
					var expires = "";
					if (p.expires[cookie]) {
						var d = new Date();
						d.setTime(d.getTime() + p.expires[cookie] * 1000);
						expires = "; expires=" + d.toUTCString();
					}
					document.cookie = cookie + "=" + self.store[cookie] + expires;
					cookies._store[cookie] = self.store[cookie];
				}
			}
			cookies._length = self.length;
		});
		
		return self;
	});
	cookies._store = {};
	cookies._length = 0;
	(function() { // initialise the global cookies array.
		var all_cookies = document.cookie.trim().split(';');
		if (all_cookies[0] == "") return;
		cookies._length = all_cookies.length;
		for (var i = 0 ; i < cookies._length ; ++i) {
			var cookie = all_cookies[i].trim();
			var eq_pos = cookie.indexOf('=');
			cookies._store[cookie.substring(0, eq_pos)] = cookie.substring(eq_pos + 1, cookie.length);
		}
	}());

	var object_get_keys = (function(obj) {
		if (Object.keys) return Object.keys(obj);
		var keys = [];
		for (var key in obj) {
			keys.push(key);
		}
		return keys;
	});

	var array_contains = (function(haystack, needle) {
		for (var i = 0, l = haystack.length ; i < l ; ++i) {
			if (haystack[i] === needle) return true;
		}
		return false;
	});
	
	var array_index_of = (function(haystack, needle) {
		if (Array.prototype.indexOf) return haystack.indexOf(needle);
		for (var i = 0, l = haystack.length ; i < l ; ++i) {
			if (haystack[i] === needle) return i;
		}
		return -1;
	});

	var object_merge = (function(obj1, obj2) {
		if (obj2) {
			var keys = Object.keys(obj2);
			for (var i = 0, l = keys.length ; i < l ; ++i) {
				obj1[i] = obj2[i];
			}
		}
		return obj1;
	});

	ao.endian = endian;
	ao.endianness = endianness;
	ao.base64tobuffer = base64tobuffer;
	ao.dom_node = dom_node;
	ao.dom_apply = dom_apply;
	ao.state_machine = state_machine;
	ao.cookies = cookies;
	ao.object_get_keys = object_get_keys;
	ao.array_contains = array_contains;
	ao.array_index_of = array_index_of;
	ao.object_merge = object_merge;
});
ao_module('terminal', ['util'], function(ao) {

	var nl = {};

	// placeCaretAtEnd - posted by Tim, stackoverflow.com/questions/4233265
	var caret_to_end = (function(el) {
		el.focus();
		if (
			typeof window.getSelection != "undefined" &&
			typeof document.createRange != "undefined"
		) {
			var range = document.createRange();
			range.selectNodeContents(el);
			range.collapse(false);
			var sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
		} else if (typeof document.body.createTextRange != "undefined") {
			var textRange = document.body.createTextRange();
			textRange.moveToElementText(el);
			textRange.collapse(false);
			textRange.select();
		}
	});

	var proc_status = {
		UNKNOWN: 0,
		START: 1,
		INPUT: 2,
		INTERUPT: 3
	};
	var proc_status_event_names = [
		'', 'onstart', 'oninput', 'oninterupt'
	]
	var proc_status_event_name = (function(status) {
		return proc_status_event_names[status];
	});

	var process = (function(argv, p) {
		argv     = argv   || {};
		p        = p      || {};
		p.name   = p.name || "process";
		p.fnc    = p.fnc  || {};
		var self = {};

		self.started = false;
		self.yield = false;
		p.status = process.status.UNKNOWN;

		if (typeof(argv.istream) !== 'function')
			throw new Error('argv.istream must be a function.');
		if (typeof(argv.ostream) !== 'function')
			throw new Error('argv.ostream must be a function.');
		if (typeof(argv.istream.eof) === 'undefined')
			throw new Error('argv.istream.eof: undefined required member');
		if (typeof(argv.ostream.nl) === 'undefined')
			throw new Error('argv.ostream.nl: undefined required member');

		p.argv = argv.argv || (
			argv.args ? (p.name + " " + argv.args).split(/\w/)
			          : p.name
		);

		self.istream = argv.istream;
		self.ostream = argv.ostream;

		self.run = (function(status) {
			if (status == process.status.START && self.started) {
				throw new Error('Call to START on already started process.');
			}
			p.status = status;
			p.fnc[status].bind(self)();
		});

		argv.switch_ctrl_rgx = argv.switch_ctrl_rgx || "-";
		argv.switch_ctrl_str = argv.switch_ctrl_str || "--";
		p.argv_act = (function(switches, regex, callback) {
			if (typeof switches == "string") {
				switches = [switches];
			}
			for (var i1 = 0, l1 = p.argv.length ; i1 < l1 ; ++i1) {
				if (switches && p.argv[i1].startsWith(argv.switch_ctrl_str)) {
					for (var i2 = 0, l2 = switches.length ; i2 < l2 ; ++i2) {
						if (p.argv[i1] == (argv.switch_ctrl_str + switches[i2])) {
							if (callback) callback(i1);
							return true;
						}
					}
				} else if (regex && p.argv[i1].startsWith(argv.switch_ctrl_rgx)) {
					if (regex.test(p.argv[i1])) {
						if (callback) callback(i1);
						return true;
					}
				}
			}
			return false;
		});

		return self;

	});
	process.status = {
		UNKNOWN: 0,
		START: 1,
		INPUT: 2,
		INTERUPT: 3
	};
	process.status_names = [
		'', 'onstart', 'oninput', 'oninterupt'
	];
	process.status_get_name = (function(status) {
		return process.status_names[status];
	});

	var process_simple = (function(argv, p) {
		argv     = argv   || {};
		p        = p      || {};
		p.name   = p.name || "process_simple";
		var self = process(argv, p);

		var call_run = (function() {
			p.fnc.run();
		});

		p.fnc[process.status.START] = call_run;
		p.fnc[process.status.INPUT] = call_run;
		p.fnc[process.status.INTERUPT] = call_run;

		return self;
	});
	process_simple.wrapper = (function(name, main) {
		return (function(argv, p) {
			argv     = argv   || {};
			p        = p      || {};
			p.name   = p.name || name;
			var self = ao.process_simple(argv, p);

			p.fnc.run = main.bind(self, argv, p);
			return self;
		});
	});

	var process_sm = (function(argv, p) {
		argv     = argv   || {};
		p        = p      || {};
		p.name   = p.name || "process_sm";
		var self = process(argv, p);

		var run_sm = function() {
			while (argv.states[p.state](self) == p.CONTINUE);
		};
		p.state = p.state || Object.keys(argv.states)[0];
		p.YIELD    = 0;
		p.EXIT     = 1;
		p.CONTINUE = 2;

		p.yield = (function(state_name) {
			if (state_name !== undefined) p.state = state_name;
			self.yield = true;
			return p.YIELD;
		});
		p.continue = (function(state_name) {
			if (state_name !== undefined) p.state = state_name;
			return p.CONTINUE;
		});
		p.exit = (function() {
			self.yield = false;
			return p.YIELD;
		});
		self.fnc = {
			yield:     p.yield,
			continue:  p.continue,
			exit:      p.exit
		};
		p.fnc[process.status.START] = run_sm;
		p.fnc[process.status.INPUT] = run_sm;
		p.fnc[process.status.INTERUPT] = run_sm;

		return self;
	});

	var terminal_base = (function(argv, p) {
		argv     = argv || {};
		p        = p    || {};
		var self = {};

		p.container = p.container || ao.element_raw(argv.container);
		p.backlog   = p.backlog   || ao.element_raw(argv.backlog);
		p.input     = p.input     || ao.element_raw(argv.input);

		if (!argv.process) {
			throw new Error('missing required parameter: "process"');
		}

		p.input_buffer = [];
		var istream = p.istream || argv.istream || (function() {
			if (p.input_buffer.length == 0) {
				return "";
			}
			return p.input_buffer.splice(0, 1)[0];
		});
		istream.eof = false;

		self.prepare_output = (function(input, append_to) {
			if (!append_to) {
				append_to = document.createDocumentFragment();
			}
			
			if (typeof(input) == 'object') {
				if (input === nl) {
					append_to.appendChild(document.createElement('br'));
				} else if (input instanceof Array) {
					var frag = document.createDocumentFragment();
					for (var i = 0,l = input.length ; i < l ; ++i) {
						self.prepare_output(input[i], frag);
					}
					append_to.appendChild(frag);
				} else {
					append_to.appendChild(input);
				}
			} else if (typeof(input) == 'string') {
				append_to.appendChild(document.createTextNode(input));
			}
			return append_to;
		});

		var ostream = p.ostream || argv.ostream || (function(input) {
			self.prepare_output(input, p.backlog);
			if (p.container.scrollTo) {
				p.container.scrollTo(0, p.container.scrollHeight);
			} else {
				p.container.scrollTop = p.container.scrollHeight;
			}
		});
		ostream.nl = nl;

		p.populate_process_argv = (function(argv) {
			argv = argv || {};
			argv.istream = argv.istream || istream;
			argv.ostream = argv.ostream || ostream;
			argv.term    = argv.term    || self;
			return argv;
		});

		p.process = argv.process(p.populate_process_argv(argv.process_init_argv));

		// call this after taking some input.
		p.input_str = (function(str) {
			p.input_buffer.push(str);
			p.process.run(proc_status.INPUT);
		});

		// call this to send an interupt signal
		self.interupt = (function() {
			p.process.run(proc_status.INTERUPT);
		});

		self.focus = (function() {
			p.input.focus();
		});
		
		self.clear = (function() {
		});
		
		self.set_input_contents = (function(input) {}); // do nothing
		
		if (!p.dont_run) {
			p.process.run(proc_status.START);
		}
		
		return self;
	});
	var terminal = (function(argv, p) {
		argv     = argv || {};
		p        = p    || {};

		p.backlog = ao.dom_node('span', {
			className: 'ao_backlog'
		});
		p.input = ao.dom_node('span', {
			className: 'ao_input',
			contentEditable: true
		});

		var dont_run = p.dont_run;
		p.dont_run = true;

		var self = terminal_base(argv, p);

		var ctrl_down  = false;
		var shift_down = false;
		var mouse_drag = false;

		if (argv.append) {
			p.backlog.innerHTML = p.container.innerHTML
		}

		ao.dom_apply(p.container, {
			innerHTML: '',
			appendChild: [
				p.backlog,
				ao.dom_node('span', {
					appendChild: [
						p.input,
						document.createTextNode('\u00A0')
					]
				})
			]
		});

		if (argv.auto_focus) p.input.focus();

		self.backlog_get = (function() {
			return p.backlog;
		});

		self.set_input_contents = (function(input) {
			for (var i = p.input.childNodes.length - 1; i >= 0 ; --i) {
				p.input.removeChild(p.input.childNodes[i]);
			}
			p.input.appendChild(document.createTextNode(input));
			caret_to_end(p.input);
		});

		self.clear = (function() {
			p.backlog.innerHTML = "";
		});

		// events

		p.container.onmousedown = (function() {
			p.mouse_drag = false;
		});
		p.container.onmousemove = (function() {
			p.mouse_drag = true;
		});
		p.container.onmouseup = (function() {
			// on click, but not drag.
			if (!p.mouse_drag && document.activeElement !== p.input) {
				p.input.focus();
				caret_to_end(p.input);
			}
		});

		p.input.onkeydown = (function(event) {
			switch (event.keyCode) {
				case 13: // enter
					p.input_str(p.input.textContent);
					p.input.textContent = '';
					return false;
					break;
				case 16: // shift
					p.shift_down = true;
					break;
				case 17: // ctrl
					p.ctrl_down = true;
					break;
				case 37: // left
					p.input_str('\u001B[D');
					break;
				case 38: // up
					p.input_str('\u001B[A');
					return false;
					break;
				case 39: // right
					p.input_str('\u001B[C');
					break;
				case 40: // down
					p.input_str('\u001B[B');
					return false;
					break;
				case 67: // 'c'
					if (p.ctrl_down && p.shift_down) {
						self.interupt();
						return false;
					}
					break;
				default:
					break;
			}
			return true;
		});

		p.input.onkeyup = (function(event) {
			switch (event.keyCode) {
				case 16: // shift
					p.shift_down = false;
					break;
				case 17: // ctrl
					p.ctrl_down = false;
					break;
				default:
					break;
			}
			return true;
		});

		if (!dont_run) {
			p.process.run(proc_status.START);
		}

		return self;
	});

	var Command = (function(tokens) {
		var self = {};

		self.tokens = [];
		self.ostream = null;
		self.istream = null;

		self.push = (function(token) {
			self.tokens.push(token);
		});

		self.empty = (function() {
			return self.tokens.length == 0;
		});

		self.exec = (function() {
			return self.tokens[0];
		});

		return self;
	});

	/* a mechanism by which one command's output can be sent to another command's input */
	var pipe = (function(argv, p) {
		argv     = argv || {};
		p        = p    || {};
		var self = {};
		
		p.buffer = [];
		
		self.ostream = (function(input) {
			p.buffer.push(input);
		});
		self.ostream.nl = nl;
		self.istream = (function() {
			if (p.buffer.length == 0) {
				return "";
			}
			return p.buffer.splice(0, 1)[0];
		});
		self.istream.eof = false;
		
		return self;
	});


	var shell_tokeniser = (function(input) {
		var self = {};
		var pos = {
			begin: 0,
			end: 0
		};
		var length = input.length;
		var output_current = '';

		self.end = (length == 0);
		self.operator = false;

		self.next_token = (function() {
			var output = '';

			pos.begin = pos.end;
			while(pos.begin < length && whitespace(pos.begin)) ++pos.begin;

			if (pos.end >= length) {
				self.end = true;
				return '';
			}

			if (operator(pos.begin) && input[pos.begin] != '\\') {
				self.operator = true;
				pos.end = pos.begin + 1;
				output = input.substr(pos.begin, 1);
			} else {
				self.operator = false;
				pos.end = pos.begin;

				while (true) {
					while(pos.end < length && other(pos.end)) ++pos.end;
					if (pos.end >= length) {
						self.end = true;
					}
					output += input.substr(pos.begin, pos.end - pos.begin);

					if (input[pos.end] == '\\') {
						output += input.substr(pos.end+1, 1);
						pos.begin = pos.end += 2;
					} else {
						break;
					}
				}
			}

			output_current = output;
			return output;
		});

		self.quoted_string = (function() {
			var output = '';
			pos.begin = pos.end;
			while (true) {
				while (pos.end < length && input[pos.end] != '"') ++pos.end;
				if (pos.end >= length) {
					self.end = true;
					break;
				}
				output += input.substr(pos.begin, pos.end - pos.begin);

				if (input[pos.end] == '\\') {
					if (pos.end+1 == length) {
						// error case
						self.end = true;
						break;
					}
					output += input.substr(pos.end+1, 1);
					pos.begin = pos.end += 2;
				} else if (input[pos.end] == output_current) {
					break;
				}
			}
			pos.end++;
			output_current = output;
			self.operator = false;
			return output;
		});

		self.ws_next = (function() {
			return pos.end < input.lenght && whitespace(pos.end);
		});

		var whitespace = (function(i) {
			return /\s/.test(input[i]);
		});
		var operator = (function(i) {
			// catches \ ' " $ ; |
			return /[\\\'\"\$;\|]/.test(input[i]);
		});
		var other = (function(i) {
			return !whitespace(i) && !operator(i);
		});

		return self;
	});

	var shell = (function(argv, p) {
		argv     = argv || {};
		p        = p    || {};
		var self = process_simple(argv, p);

		var os = argv.ostream;
		var is = argv.istream;

		p.prompt = p.prompt || argv.prompt || "$ ";
		self.prompt = (function() {
			return p.prompt;
		});

		p.cmds = argv.cmds || {};
		p.cmd_get = (function(identifier) {
			return p.cmds[identifier];
		});

		p.history = [];
		p.history_p = 0;
		var history_append = (function(input_str) {
			if (p.history[p.history.length - 1] != input_str)
				p.history.push(input_str);
			p.history_p = p.history.length;
		});

		p.env = p.env || {};

		p.populate_process_argv = (function(new_argv) {
			new_argv = new_argv || {};
			new_argv.istream = new_argv.istream || is;
			new_argv.ostream = new_argv.ostream || os;
			new_argv.term    = new_argv.term    || argv.term;
			new_argv.shell   = new_argv.shell   || self;
			return new_argv;
		});

		p.command_tree = (function(input) {
			var tokeniser = shell_tokeniser(input);
			var token;
			var commands = [];
			var chain = [];
			var command = Command();

			chain.push(command);
			commands.push(chain);

			while (!tokeniser.end) {
				token = tokeniser.next_token();
				if (!tokeniser.operator && token != '') {
					command.push(token);
				} else {
					switch (token) {
						case '\'':
						case '\"': 
							command.push(tokeniser.quoted_string());
							break;
						case '$':
							if (tokeniser.ws_next()) {
								command.push('$');
							} else {
								token = tokeniser.next_token();
								if (typeof(p.env[token]) != 'undefined')
									command.push(p.env[token]);
							}
							break;
						case ';': // semicolon. sequentially run left and right things.
							if (!command.empty()) {
								command = Command();
								chain = [];
								chain.push(command)
								commands.push(chain);
							}
							break;
						case '|': // pipe. split the current command tree into two, linking their IO streams.
							if (!command.empty()) {
								command = Command();
								chain.push(command);
							}
							break;
						case '':
							// only valid after the end of a quoted string where no further input exists
							if (!tokeniser.end)
								throw new Error('Unexpected token "'+token+'"');
							break;
						default:
							// error case
							throw new Error('unexpected operator "'+token+'"');
					}
				}
			}
			return commands;
		});

		var ctrl_get = (function(input) {
			var res = /\u001B\[(.)/.exec(input);
			return res ? res[1] : false;
		});

		var ctrl_handle = (function(c) {

			var ret = false;
			if (c == 'B' || c == 'A') {
				if (c == 'A') {    // UP
					--p.history_p;
					if (p.history_p < 0) p.history_p = 0;
				} else {           // DOWN
					++p.history_p;
				}

				if (p.history_p >= p.history.length) {
					p.history_p = p.history.length;
					argv.term.set_input_contents('');
				} else {
					argv.term.set_input_contents(p.history[p.history_p]);
				}
			}

			return ret;
		});

		self.onstart = (function() {
			lifecycle();
		});

		self.oninput = (function(args, quiet) {
			lifecycle();
		});

		self.oninterupt = (function() {
			lifecycle();
		});


		var lifecycle = (function() {
			var states = {};
			var machine = ao.state_machine({states:states}, {state:"setup"});
			
			var commands = [];
			var active_cmd = [];

			states.setup = (function() {
				self.yield = true;
				if (argv.args) {
					commands = p.command_tree(argv.args);
					return machine.continue("prepare_cmds");
				} else {
					return machine.continue("prompt_and_wait");
				}
			});

			states.prompt_and_wait = (function() {
				if (is.eof) {
					self.yield = false;
					return machine.yield("setup");
				} else {
					os(self.prompt());
					return machine.yield("handle_input");
				}
			});

			states.handle_input = (function() {
				var input = is();
				var input_str = '';
				if (!input) {
					os(self.ostream.nl);
					return machine.continue("prompt_and_wait");
				} else if (ctrl = ctrl_get(input)) {
					if (ctrl_handle.bind(self)(ctrl)) {
						return machine.continue("prompt_and_wait");
					} else {
						return machine.yield();
					}
				} else {
					do {
						os([input, os.nl]);
						commands = p.command_tree(input);
						input_str += input;
					} while (input = is());
					
					// manage the history
					history_append(input_str);
					input_str = '';
					// done
					return machine.continue("prepare_cmds");
				}
			});

			states.prepare_cmds = (function() {
				if (commands.length == 0) {
					return machine.continue("prompt_and_wait");
				}
				var chain = commands.splice(0, 1)[0];
				var pipe_old = null;
				var pipe_new = null;
				var length = chain.length
				
				active_cmd = [];

				for (var i = 0 ; i < length ; ++i) {
					var command = chain[i];
					if (command.empty()) continue;
					
					var cmd = p.cmd_get(command.exec());
					if (!cmd) {
						// ensure cmd is found here, rerun state if not.
						os([command.exec(), ': command not found', os.nl]);
						return machine.continue();
					}

					if (i+1 < length) {
						pipe_new = pipe();
					} else {
						pipe_new = null;
					}

					var process = cmd(p.populate_process_argv({
						istream: pipe_old ? pipe_old.istream : is,
						ostream: pipe_new ? pipe_new.ostream : os,
						argv: command.tokens
					}));
					active_cmd.push(process);

					pipe_old = pipe_new;

				}
				
				return machine.continue("run_cmds");
			});

			states.run_cmds = (function() {
				var i = 0;
				while (i < active_cmd.length) {
					active_cmd[i].run(active_cmd[i].started ? proc_status.INPUT : proc_status.START);

					if (active_cmd[i].yield) {
						++i;
					} else {
						if (active_cmd[i+1]) {
							active_cmd[i+1].istream.eof = true;
						}
						active_cmd.splice(i, 1);
					}
				}
				
				if (active_cmd.length == 0) {
					return machine.continue("prepare_cmds");
				} else {
					return machine.yield();
				}
			});
			
			return machine;
		}() );

		p.fnc.run = (function() {
			lifecycle();
		});

		return self;
	});

	ao.nl             = nl;
	ao.caret_to_end   = caret_to_end;
	ao.proc_status    = proc_status;
	ao.process        = process;
	ao.process_simple = process_simple;
	ao.process_sm     = process_sm;
	ao.terminal_base  = terminal_base;
	ao.terminal       = terminal;
	ao.shell          = shell;
});

