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

	window.onload = (function() {
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
			if (typeof(element[i]) == 'function') {
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

	ao.endian = endian;
	ao.endianness = endianness;
	ao.base64tobuffer = base64tobuffer;
	ao.dom_node = dom_node;
	ao.dom_apply = dom_apply;
});
ao_module('terminal', ['util'], function(ao) {

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

	var processify = (function(proc, istream, ostream, term) {
		if (typeof(istream) !== 'function')
			throw new Error('istream must be a function.');
		if (typeof(ostream) !== 'function')
			throw new Error('ostream must be a function.');
		if (typeof(istream.eof) === 'undefined')
			throw new Error('istream.eof: undefined required member');
		if (typeof(ostream.nl) === 'undefined')
			throw new Error('ostream.nl: undefined required member');

		proc.istream = istream;
		proc.ostream = ostream;
		proc.term    = term;
		proc.yeild   = false;
		proc.status  = proc_status.UNKNOWN;

		proc._run = (function(status) {
			proc.status = status;
			var event_name = proc_status_event_name(status);
			if (typeof(proc[event_name]) == 'function') {
				proc[event_name].bind(proc)();
			} else if (typeof(proc) == 'function') {
				proc.bind(proc)();
			}
		});
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

		var ostream = p.ostream || argv.ostream || (function(input) {
			if (typeof(input) == 'object') {
				if (input === argv.process.ostream.nl) {
					p.backlog.appendChild(document.createElement('br'));
				} else if (input instanceof Array) {
					for (var i = 0,l = input.length ; i < l ; ++i) {
						argv.process.ostream(input[i]);
					}
				} else {
					p.backlog.appendChild(input);
				}
			} else if (typeof(input) == 'string') {
				p.backlog.appendChild(document.createTextNode(input));
			}
			window.scrollTo(0, document.body.scrollHeight);
		});
		ostream.nl = {};

		processify(argv.process, istream, ostream, self);


		// call this after taking some input.
		p.input_str = (function(str) {
			p.input_buffer.push(str);
			argv.process._run(proc_status.INPUT);
		});

		// call this to send an interupt signal
		self.interupt = (function() {
			argv.process._run(proc_status.INTERUPT);
		});

		self.focus = (function() {
			p.input.focus();
		});
		
		self.clear = (function() {
		});
		
		self.set_input_contents = (function(input) {}); // do nothing
		
		if (!p.dont_run) {
			argv.process._run(proc_status.START);
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
			argv.process._run(proc_status.START);
		}

		return self;
	});

	var Command = (function(tokens) {
		var self = {};

		self.tokens = [];

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
				while (pos.end < length && !operator(pos.end)) ++pos.end;
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
		var self = {};

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
		var history_append = (function(input) {
			if (p.history[p.history.length - 1] != input_str)
				p.history.push(input_str);
			p.history_p = p.history.length;
		});

		p.env = p.env || {};

		p.processify = (function(proc, istream, ostream, term) {
			processify(proc, istream, ostream, term);
			proc.shell = self;
		});

		p.command_tree = (function(input) {
			var tokeniser = shell_tokeniser(input);
			var token;
			var commands = [];
			var command = Command();

			commands.push(command);

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
								commands.push(command);
							}
							break;
						case '|': // pipe. split the current command tree into two
							
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
console.log(commands);
			return commands;
		});

		var ctrl_get = (function(input) {
			var res = /\u001B\[(.)/.exec(input);
			return res ? res[1] : false;
		});

		var ctrl_handle = (function(c) {

			if (c == 'B' || c == 'A') {
				if (c == 'A') {    // UP
					--p.history_p;
					if (p.history_p < 0) p.history_p = 0;
				} else {           // DOWN
					++p.history_p;
				}

				if (p.history_p >= p.history.length) {
					p.history_p = p.history.length;
					this.term.set_input_contents('');
				} else {
					this.term.set_input_contents(p.history[p.history_p]);
				}
			}

		//	console.log(c);
		/*
			switch (c) {
				case 'A': this.ostream(['UP', this.ostream.nl]); break;
				case 'B': this.ostream(['DOWN', this.ostream.nl]); break;
				case 'C': this.ostream(['RIGHT', this.ostream.nl]); break;
				case 'D': this.ostream(['LEFT', this.ostream.nl]); break;
			}
		//*/

			return true;
		});

		self.onstart = (function() {
			this.yeild = true;
			if (argv.args) {
				self.oninput(argv.args, true);
			}
			else {
				this.ostream(this.prompt());
			}
		});

		var input = [];
		var input_str = '';
		self.oninput = (function(args, quiet) {

			var commands;
			var input = args || this.istream();
			if (!input) this.ostream(this.ostream.nl);
			else if (ctrl = ctrl_get(input)) {
				if (ctrl_handle.bind(this)(ctrl)) return;
			} else {
				do {
					if (!quiet) {
						this.ostream([input, this.ostream.nl]);
					}
					commands = p.command_tree(input);
					input_str += input;
				} while (input = this.istream());
				
				// manage the history
				history_append(input_str);
				input_str = '';
				// done



				for (command of commands) {
					if (command.empty()) continue;
					var cmd = p.cmd_get(command.exec());
					if (cmd) {
						p.processify(cmd, this.istream, this.ostream, this.term);
						cmd.argv = command.tokens;
						cmd._run(proc_status.START);
					} else {
						this.ostream([command.exec(), ': command not found', this.ostream.nl]);
					}
				}

/*
				input = (tokens);
				var cmd = p.cmd_get(input[0]);
				if (cmd) {
					p.processify(cmd, this.istream, this.ostream, this.term);
					cmd.argv = input;
					cmd._run(proc_status.START);
				} else {
					this.ostream([input[0], ': command not found', this.ostream.nl]);
				}
//*/
			}

			if (this.istream.eof) {
				this.yeild = false;
			} else {
				this.ostream(this.prompt());
			}
		});


		self.oninterupt = (function() {
		});

		return self;
	});

	ao.caret_to_end  = caret_to_end;
	ao.proc_status   = proc_status;
	ao.terminal_base = terminal_base;
	ao.terminal      = terminal;
	ao.shell         = shell;
});

