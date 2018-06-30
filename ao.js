(function () {

	var _event_handlers = {
		"DOMContentLoaded":  [],
		"beforeunload":      [],
		"onkeydown":         [],
		"onkeyup":           []
	};

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
			_event_handlers.DOMContentLoaded.push(callback);
			return ao;
		});
		ao.before_unload = (function(callback) {
			_event_handlers.beforeunload.push(callback);
			return ao;
		});
		ao.keydown = (function(callback) {
			_event_handlers.onkeydown.push(callback);
			return ao;
		});
		ao.keyup = (function(callback) {
			_event_handlers.onkeydown.push(callback);
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

	var generic_eventlistener = (function(event_name) {
		return (function(event) {
			var ret = true;
			for (var i = 0, l = _event_handlers[event_name].length ; i < l ; ++i) {
				var result = _event_handlers[event_name][i](event);
				if (result !== undefined && result !== true) {
					ret = false;
				}
			}
			return ret;
		});
	});

	document.addEventListener("DOMContentLoaded", generic_eventlistener("DOMContentLoaded") );
	window.addEventListener(  "beforeunload",     generic_eventlistener("beforeunload")     );
	document.addEventListener("keydown",          generic_eventlistener("onkeydown")        );
	document.addEventListener("keyup",            generic_eventlistener("onkeyup")          );

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
				do {
					self.current = argv.states[p.state].name;
					self.next    = argv.states[p.state].next;
				} while (argv.states[p.state].bind(argv.bind)(self, p.ctx) == p.CONTINUE);
			};
		} else {
			var self = function() {
				do {
					self.current = argv.states[p.state].name;
					self.next    = argv.states[p.state].next;
				} while (argv.states[p.state](self, p.ctx) == p.CONTINUE);
			};
		}
		p.keys     = Object.keys(argv.states);
		p.state    = p.state || p.keys[0];
		p.ctx      = argv.ctx || {};
		p.YIELD    = 0;
		p.CONTINUE = 1;
		self.first = p.state;

		for (var i = 0, l = p.keys.length ; i < l ; ++i) {
			argv.states[p.keys[i]].name = p.keys[i];
			argv.states[p.keys[i]].next = p.keys[i+1%l];
		}

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
			continue:  self.continue,
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

	var process_manager = (function(argv, p) {
		argv     = argv   || {};
		p        = p      || {};
		var self = {
			processes: []
		};

		p.latest_pid = 0;

		self.spawn = (function() {
		});

		return self;
	});

	var _process_pid_counter = 0;
	var process = (function(argv, p) {
		argv     = argv   || {};
		p        = p      || {};
		p.name   = p.name || "process";
		p.fnc    = p.fnc  || {};
		var self = {};

		self.started = false;
		self.yield = false;
		p.status = process.status.UNKNOWN;

		var _pid = ++_process_pid_counter;
		self.pid = (function() {
			return _pid;
		});

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

		self.signal = (function(sig, argv) {
			var caught = false;
			arvg = argv || {};
			if (!(sig & process.SIG_CANTCATCH) && p.signal_handler[sig]) caught = p.signal_handler[sig](argv);
			if (!caught) {
				if (sig & (process.SIG_TERMINATE | process.SIG_STOP)) {
					// tell the parent process/terminal to stop this process
				//	(self.shell || self.term).
				}
			}
			return caught;
		});


		p.signal_handler = {};
		p.signal_handler[process.SIGINPUT] = (function() {
			self.run(proc_status.INPUT);
		});

		self.receive_ctrl_code = (function(code, alt, shift) {
			// processes get notified of this sort of thing.
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

		p.exit = (function() {
			self.yield = false;
			window.setTimeout(function() {
				argv.term.process_exited(_pid)
			}, 0);
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


	// fyi: These identifiers don't match their posix counterparts.
	process.SIGNULL       = 0x00;
	process.SIGHUP        = 0x11; // Hangup
	process.SIGINT        = 0x12; // Interupt Signal
	process.SIGPIPE       = 0x13; // Write on a pipe with no one to read it.
	process.SIGPOLL       = 0x14; // Pollable event.
	process.SIGPROF       = 0x15; // Profiling timer expired.
	process.SIGUSR1       = 0x16; // User-defined signal 1.
	process.SIGUSR2       = 0x17; // User-defined signal 2.
	process.SIGVTALRM     = 0x18; // Virtual timer expired.
	process.SIGKILL       = 0x99; // Kill, cannot be caught of ignored.
	process.SIGALRM       = 0x1a; // Alarm clock
	process.SIGTERM       = 0x1b; // Termination signal
	process.SIGBUS        = 0x31; // Access to an undefined portion of a memory object.
	process.SIGFPE        = 0x32; // Erroneous arithmetic operation.
	process.SIGQUIT       = 0x33; // Terminal quit signal
	process.SIGILL        = 0x34; // Illegal instruction.
	process.SIGTRAP       = 0x35; // Trace/Breakpoint trap
	process.SIGABRT       = 0x36; // Process abort signal
	process.SIGSEGV       = 0x37; // Invalid memory reference.
	process.SIGSYS        = 0x38; // Bad system call.
	process.SIGXCPU       = 0x39; // CPU time limit exceeded.
	process.SIGXFSZ       = 0x3a; // File size limit exceeded
	process.SIGSTOP       = 0xc1; // Stop executing (cannot be caught or ignored).
	process.SIGTSTP       = 0x42; // Terminal stop signal.
	process.SIGTTIN       = 0x43; // Background process attempting read.
	process.SIGTTOU       = 0x44; // Background process attempting write.
	process.SIGCONT       = 0x01; // Continue executing, if stopped.
	process.SIGCHLD       = 0x02; // Child process terminated, stopped, or continued.
	process.SIGURG        = 0x03; // High bandwidth data is available at a socket.
	process.SIGWINCH      = 0x04; // Terminal window size changed
	process.SIGINPUT      = 0x06; // Data available on istream

	// bitmasks
	process.SIG_TERMINATE = 0x10;
	process.SIG_COREDUMP  = 0x20;
	process.SIG_STOP      = 0x40;
	process.SIG_CANTCATCH = 0x80;
	process.SIG_BITMASK   = 0xf0;

	process.SIGCHLD_UNKNOWN = 0;
	process.SIGCHLD_CONT    = 1;
	process.SIGCHLD_STOP    = 2;
	process.SIGCHLD_TERM    = 3;

	process.sig2str = (function(sig) {
		switch (sig) {
			case process.SIGNULL:       return "SIGNULL";
			case process.SIGHUP:        return "SIGHUP";
			case process.SIGINT:        return "SIGINT";
			case process.SIGPIPE:       return "SIGPIPE";
			case process.SIGPOLL:       return "SIGPOLL";
			case process.SIGPROF:       return "SIGPROF";
			case process.SIGUSR1:       return "SIGUSR1";
			case process.SIGUSR2:       return "SIGUSR2";
			case process.SIGVTALRM:     return "SIGVTALRM";
			case process.SIGKILL:       return "SIGKILL";
			case process.SIGALRM:       return "SIGALRM";
			case process.SIGTERM:       return "SIGTERM";
			case process.SIGBUS:        return "SIGBUS";
			case process.SIGFPE:        return "SIGFPE";
			case process.SIGQUIT:       return "SIGQUIT";
			case process.SIGILL:        return "SIGILL";
			case process.SIGTRAP:       return "SIGTRAP";
			case process.SIGABRT:       return "SIGABRT";
			case process.SIGSEGV:       return "SIGSEGV";
			case process.SIGSYS:        return "SIGSYS";
			case process.SIGXCPU:       return "SIGXCPU";
			case process.SIGXFSZ:       return "SIGXFSZ";
			case process.SIGSTOP:       return "SIGSTOP";
			case process.SIGTSTP:       return "SIGTSTP";
			case process.SIGTTIN:       return "SIGTTIN";
			case process.SIGTTOU:       return "SIGTTOU";
			case process.SIGCONT:       return "SIGCONT";
			case process.SIGCHLD:       return "SIGCHLD";
			case process.SIGURG:        return "SIGURG";
			case process.SIGWINCH:      return "SIGWINCH";
			case process.SIGINPUT:      return "SIGINPUT";

			case process.SIG_TERMINATE: return "SIG_TERMINATE";
			case process.SIG_COREDUMP:  return "SIG_COREDUMP";
			case process.SIG_STOP:      return "SIG_STOP";
			case process.SIG_CANTCATCH: return "SIG_CANTCATCH";
			case process.SIG_BITMASK:   return "SIG_BITMASK";

			default: return "Unknown";
		}
	});
	process.str2sig = (function(str) {
		switch (sig) {
			case "0x11": case "SIGHUP":        return process.SIGHUP;
			case "0x12": case "SIGINT":        return process.SIGINT;
			case "0x13": case "SIGPIPE":       return process.SIGPIPE;
			case "0x14": case "SIGPOLL":       return process.SIGPOLL;
			case "0x15": case "SIGPROF":       return process.SIGPROF;
			case "0x16": case "SIGUSR1":       return process.SIGUSR1;
			case "0x17": case "SIGUSR2":       return process.SIGUSR2;
			case "0x18": case "SIGVTALRM":     return process.SIGVTALRM;
			case "0x99": case "SIGKILL":       return process.SIGKILL;
			case "0x1a": case "SIGALRM":       return process.SIGALRM;
			case "0x1b": case "SIGTERM":       return process.SIGTERM;
			case "0x31": case "SIGBUS":        return process.SIGBUS;
			case "0x32": case "SIGFPE":        return process.SIGFPE;
			case "0x33": case "SIGQUIT":       return process.SIGQUIT;
			case "0x34": case "SIGILL":        return process.SIGILL;
			case "0x35": case "SIGTRAP":       return process.SIGTRAP;
			case "0x36": case "SIGABRT":       return process.SIGABRT;
			case "0x37": case "SIGSEGV":       return process.SIGSEGV;
			case "0x38": case "SIGSYS":        return process.SIGSYS;
			case "0x39": case "SIGXCPU":       return process.SIGXCPU;
			case "0x3a": case "SIGXFSZ":       return process.SIGXFSZ;
			case "0xc1": case "SIGSTOP":       return process.SIGSTOP;
			case "0x42": case "SIGTSTP":       return process.SIGTSTP;
			case "0x43": case "SIGTTIN":       return process.SIGTTIN;
			case "0x44": case "SIGTTOU":       return process.SIGTTOU;
			case "0x01": case "SIGCONT":       return process.SIGCONT;
			case "0x02": case "SIGCHLD":       return process.SIGCHLD;
			case "0x03": case "SIGURG":        return process.SIGURG;
			case "0x04": case "SIGWINCH":      return process.SIGWINCH;
			case "0x06": case "SIGINPUT":      return process.SIGINPUT;

			case "0x10": case "SIG_TERMINATE": return process.SIG_TERMINATE;
			case "0x20": case "SIG_COREDUMP":  return process.SIG_COREDUMP;
			case "0x40": case "SIG_STOP":      return process.SIG_STOP;
			case "0x80": case "SIG_CANTCATCH": return process.SIG_CANTCATCH;
			case "0xf0": case "SIG_BITMASK":   return process.SIG_BITMASK;

			default: return process.SIGNULL;
		}
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
		p.istream = p.istream || argv.istream || (function() {
			if (p.input_buffer.length == 0) {
				return "";
			}
			return p.input_buffer.splice(0, 1)[0];
		});
		p.istream.eof = false;

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

		p.ostream = p.ostream || argv.ostream || (function(input) {
			self.prepare_output(input, p.backlog);
			if (p.container.scrollTo) {
				p.container.scrollTo(0, p.container.scrollHeight);
			} else {
				p.container.scrollTop = p.container.scrollHeight;
			}
		});
		p.ostream.nl = nl;

		p.populate_process_argv = (function(argv) {
			argv = argv || {};
			argv.istream = p.istream;
			argv.ostream = p.ostream;
			argv.term    = argv.term    || self;
			return argv;
		});

		p.process = argv.process(p.populate_process_argv(argv.process_init_argv));

		// call this after taking some input.
		p.input_str = (function(str) {
			p.input_buffer.push(str);
			p.process.signal(process.SIGINPUT);
		});

		self.receive_ctrl_code = (function(code, alt, shift) {
			alt   = (alt   === true);
			shift = (shift === true);

			if (code == 3) { // ^C
				var caught = (p.process.signal(process.SIGINT) == true);
				if (!caught) {
					// end the process.
					self.on_process_complete();
				}
			}

			p.process.receive_ctrl_code(code, alt, shift);

			return self.receive_ctrl_code.return_normal;
		});
		self.receive_ctrl_code.return_normal = 0;
		self.receive_ctrl_code.return_default_action = 1;

		// call this to send an interupt signal
		self.interupt = (function() {
			p.process.run(proc_status.INTERUPT);
			if (!p.process.yield) self.on_process_complete();
		});

		self.focus = (function() {
			p.input.focus();
		});

		self.clear = (function() {
		});

		self.set_input_contents = (function(input) {}); // do nothing

		if (!p.dont_run) {
			p.process.run(proc_status.START);
			if (!p.process.yield) self.on_process_complete();
		}

		self.on_process_complete = (function() {
			p.ostream([p.ostream.nl, "Process Complete."]);
			p.process = null;
		});

		// called by the process' exit function. Triggers SIGCHLD to be sent to the child process.
		self.process_exited = (function(pid) {
			if (p.process.pid() == pid) {
				self.on_process_complete();
			} else {
				p.process.signal(process.SIGCHLD, {child_pid: pid, action: process.SIGCHLD_TERM});
			}
		});

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

		// ^C should interupt when no text is selected, else it should copy as is normal gui behaviour.
		// ^V isnt being used for anything interesting terminal wise, let it be paste.
		var parent_receive_ctrl_code = self.receive_ctrl_code;
		self.receive_ctrl_code = (function(code, alt, shift) {
			alt   = (alt   === true);
			shift = (shift === true);

			if (code==3 && !alt && !shift && window.getSelection().type != "Caret") { // ^C
				return self.receive_ctrl_code.return_default_action;
			}
			if (code==22) { // ^V
				return self.receive_ctrl_code.return_default_action;
			}
			if (code==4) {
				p.istream.eof = true;
				p.input_str(p.input.textContent);
				p.input.textContent = '';
				p.istream.eof = false;
			}

			return parent_receive_ctrl_code(code, alt, shift);
		});

		var parent_on_process_complete = self.on_process_complete;
		self.on_process_complete = (function() {
// TODO: add an option to restart the process.
			parent_on_process_complete();
			window.removeEventListener("beforeunload", onbeforeunload);
			p.input.contentEditable = false;
			p.ostream([p.ostream.nl, "(ctrl-w to close this window)"]);
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

			var code = event.keyCode;
			if (event.ctrlKey)
				code &= 0x1f;

			switch (code) {
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
				default:
					break;
			}

			if (event.ctrlKey) {
				var result = self.receive_ctrl_code(code, event.altKey, event.shiftKey);
				if (result === self.receive_ctrl_code.return_normal) {
					event.preventDefault();
					return false;
				} else if (result === self.receive_ctrl_code.return_default_action) {
					return true;
				} else {
					throw new Error("unhandled control code.");
				}
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
				case 68:
					event.preventDefault();
 if (event.stopPropagation)    event.stopPropagation();
 if (event.cancelBubble!=null) event.cancelBubble = true;
					return false;
				default:
					break;
			}
			return true;
		});

		// if the user tries to leave the page while the terminal has focus and the control key is held,
		// its possible they just tried to delete a word (ctrl-w)
		var onbeforeunload = (function(event) {
			if (p.input == document.activeElement && p.ctrl_down) {
				var confirmationMessage = "Use ctrl-alt-w to delete words.";
				p.ctrl_down = false;

				(event||window.event).returnValue = confirmationMessage;
				return confirmationMessage;
			}
		});
		window.addEventListener("beforeunload", onbeforeunload);

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
		p.name   = p.name || "AO Shell";
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

		// populated by the prepare_cmds state.
		p.child_processes = [];

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
				os(self.prompt());
				return machine.yield("handle_input");
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

				p.child_processes = [];

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
					p.child_processes.push(process);

					pipe_old = pipe_new;

				}

				return machine.continue("run_cmds");
			});

			states.run_cmds = (function() {
				var i = 0;
				while (i < p.child_processes.length) {
					if (!p.child_processes[i].started) {
						p.child_processes[i].run(proc_status.START);
					} else {
						p.child_processes[i].signal(process.SIGINPUT);
					}

					if (p.child_processes[i].yield) {
						++i;
					} else {
						if (p.child_processes[i+1]) {
							p.child_processes[i+1].istream.eof = true;
						}
						p.child_processes.splice(i, 1);
					}
				}

				if (p.child_processes.length == 0) {
					return machine.continue("prepare_cmds");
				} else {
					return machine.yield();
				}
			});

			states.done = (function() {
				self.yield = false;
				console.log("Run called on a completed shell process.")
			});

			return machine;
		}() );

		p.fnc.run = (function() {
			lifecycle();
		});

		p.signal_handler[process.SIGCHLD] = (function(argv) {
			if (argv.action = process.SIGCHLD_TERM) {
				// stop the running process if argv.pid matches. otherwise, propogate the signal to the child processes
			}
		});

//		p.signal_handler[process.SIGINT] = (function() {
//			if (argv.action = process.SIGCHLD_TERM) {
//				// stop the running process if argv.pid matches. otherwise, propogate the signal to the child processes
//			}
//		});

		return self;
	});

	ao.nl              = nl;
	ao.caret_to_end    = caret_to_end;
	ao.proc_status     = proc_status;
	ao.process_manager = process_manager();
	ao.process         = process;
	ao.process_simple  = process_simple;
	ao.process_sm      = process_sm;
	ao.terminal_base   = terminal_base;
	ao.terminal        = terminal;
	ao.shell           = shell;
});

