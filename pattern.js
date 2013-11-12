/*
 * pattern.js 0.7.0
 *
 *
 * Copyright (c) 2013 Wesley Smith
 * Licensend under the MIT license.
 */
var Pattern = (function(undefined) {

// setup
var opnames = [
	"STRING", "NUMBER", "BOOL",
	"SET", "RANGE",
	"AND", "OR", "REP", "DIFFERENCE",
	"IGNORE",
	"GRAMMAR", "RULE",
	"CAPTURE", "POSITION", "CONSTANT",
	"TABLE", "GROUP", 
	"CSTRING", "FUNCTION", "MATCHTIME",
	"SUBSTITUTE",
];

var opcodes = {};
for(var i=0; i < opnames.length; ++i) {
	var name = opnames[i];
	opcodes[name] = i;
	opcodes[i] = name;
}

var Capture = function(v, sidx, eidx) {
	this.v = v;
	this.sidx = sidx;
	this.eidx = eidx;
}


function State() {
	this.idx = 0;
	this.captures = [];
	this.capturesStack = [];
	this.namedCaptures = {};
	this.namedCaptureStack = [];
	this.env = [];
	this.substitutions = [];
	this.substitute = false;
	this.depth = 0;
	this.cdepth = 0;
	//this.couldEnd = 0;
}

State.prototype.indent = function() {
	var res = "";
	for(var i=0; i < this.depth; ++i) {
		res += "  ";
	}
	return res;
}

State.prototype.cindent = function() {
	var res = "";
	for(var i=0; i < this.namedCaptureStack.length; ++i) {
		res += "  ";
	}
	return res;
}

State.prototype.resetPosition = function(idx) {
	//this.couldEnd = this.idx;
	this.idx = idx;
}

State.prototype.addSubstitution = function(v) {
	this.substitutions.push(v);
}

State.prototype.printNamedCaptures = function() {
	console.log("\n");
	console.log(this.cindent()+this.namedCaptureStack.length, this.namedCaptures);
	for(var i=this.namedCaptureStack.length-1; i >= 0; --i) {
		console.log(this.cindent()+i, this.namedCaptureStack[i]);
	}
	console.log("\n");
}

State.prototype.makeSubstitution = function(v, sidx) {
	var res = "";
	var idx = 0;
	for(var i=0; i < this.substitutions.length; i++) {
		var sub = this.substitutions[i];
		var _sidx = sub.sidx-sidx;
		var _eidx = sub.eidx-sidx;
		if(_sidx > idx) {
			res += v.substring(idx, _sidx);
			idx = _sidx;
		}
		res += sub.v;
		idx = _eidx;
	}
	if(idx < v.length) {
		res += v.substring(idx, v.length);
	}
	this.substitutions = [];
	return res;
}

State.prototype.pushCaptures = function() {
	//console.log(this.cindent()+"pushCaptures:", this.capturesStack.length);
	//++this.cdepth;
	//console.log(this.cindent()+"pushCaptures:");
	this.capturesStack.push(this.captures);
	this.namedCaptureStack.push(this.namedCaptures);
	this.captures = [];
	this.namedCaptures = {};
	//this.printNamedCaptures();
}

State.prototype.popCaptures = function() {
	//--this.cdepth;
	//console.log(this.cindent()+"popCaptures:", this.capturesStack.length);
	var popped = this.namedCaptures;
	this.captures = this.capturesStack.pop();
	this.namedCaptures = this.namedCaptureStack.pop();
	//console.log(this.cindent()+"popped:", popped);
	//this.printNamedCaptures();
}

State.prototype.mergeAndPopCaptures = function(reverse) {
	//--this.cdepth;
	//console.log(this.cindent()+"mergeAndPopCaptures:", this.capturesStack.length);
	//console.log(this.cindent()+"***mergeAndPopCaptures:", this.namedCaptures);
	//this.printNamedCaptures();
	
	if(reverse) this.captures = this.capturesStack.pop().concat(this.captures);
	else this.captures = this.captures.concat(this.capturesStack.pop());
	
	this.collectNamedCaptures(this.namedCaptureStack[this.namedCaptureStack.length-1]);
	//console.log(this.cindent()+"__mergeAndPopCaptures:", this.namedCaptures);
	//this.printNamedCaptures();
	this.namedCaptures = this.namedCaptureStack.pop();
	//console.log(this.cindent()+"mergeAndPopCaptures:", this.namedCaptures);
	//this.printNamedCaptures();
}

State.prototype.appendCapture = function(v) {
	this.captures.push(v);
}

State.prototype.prependCapture = function(v) {
	this.captures.unshift(v);
}

State.prototype.nameAndPopCaptures = function(name) {
	var capture = this.captures;
	//this.captures = this.capturesStack.pop();
	this.popCaptures();
	this.namedCaptures[name] = capture;
	//console.log(this.cindent()+"nameAndPopCaptures:", this.namedCaptures, this.namedCaptureStack.length);
	//this.printNamedCaptures();
}

State.prototype.collectNamedCaptures = function(o) {
	//console.log("**"+this.cindent()+"collectNamedCaptures:", this.capturesStack.length);
	//console.log(this.cindent()+"collectNamedCaptures:", this.namedCaptures, this.namedCaptureStack.length);
	for(var name in this.namedCaptures) {
		o[name] = this.namedCaptures[name];
		if(o[name].length == 1) o[name] = o[name][0];
	}
	this.namedCaptures = {};
}


var Pattern = function(v, opcode) {
	this.v = v;
	if(opcode) {
		this.opcode = opcode;
	}
	else {
		if(typeof v == "string") {
			this.opcode = opcodes.STRING;
		}
		else if(typeof v == "number") {
			if(this.v == 0) console.error("invalid argument, value must be non-zero");
			this.opcode = opcodes.NUMBER;
		}
		else if(typeof v == "boolean") {
			this.opcode = opcodes.BOOL;
		}
		else if(typeof v == "object") {
			this.opcode = opcodes.GRAMMAR;
		}
		else {
			console.error("XXX");
		}
	}
}

Pattern.prototype.rep = function(n) {
	return new Pattern({
		pattern: this,
		rep: n
	}, opcodes.REP);
}

Pattern.prototype.and = function(p2) {
	if(typeof p2 != "object") {
		p2 = new Pattern(p2);
	}

	return new Pattern({
		p1: this,
		p2: p2
	}, opcodes.AND);
}

Pattern.prototype.or = function(p2) {
	if(typeof p2 != "object") {
		p2 = new Pattern(p2);
	}
	
	return new Pattern({
		p1: this,
		p2: p2
	}, opcodes.OR);
}

Pattern.prototype.invert = function() {
	//return new Pattern(this, opcodes.DIFFERENCE);
	return (new Pattern(1)).sub(this);
}

Pattern.prototype.sub = function(p2) {
	if(typeof p2 != "object") {
		p2 = new Pattern(p2);
	}
	
	return new Pattern({
		p1: this,
		p2: p2
	}, opcodes.DIFFERENCE);
}

Pattern.prototype.ignore = function() {
	return new Pattern(this, opcodes.IGNORE);
}

Pattern.prototype.match = function(s) {
	var state = new State();
	var res = this.match_(state, s);
	if(res) {
		if(state.captures.length > 0) return state.captures;
		else return state.idx;
	}
}



Pattern.prototype.match_ = function(state, s) {
	++state.depth;
	
	//console.log(state.indent()+(s[state.idx]), state.idx, opcodeNames[this.opcode]);
	
	var res;
	switch(this.opcode) {
		case opcodes.STRING: res = this.matchString(state, s); break;
		case opcodes.NUMBER: res = this.matchNumber(state, s); break;
		case opcodes.BOOL: res = this.matchBool(state, s); break;
		case opcodes.REP: res = this.matchRep(state, s); break;
		case opcodes.AND: res = this.matchAnd(state, s); break;
		case opcodes.OR: res = this.matchOr(state, s); break;
		case opcodes.SET: res = this.matchSet(state, s); break;
		case opcodes.IGNORE: res = this.matchIgnore(state, s); break;
		case opcodes.CAPTURE: res = this.matchCapture(state, s); break;
		case opcodes.POSITION: res = this.matchPosition(state, s); break;
		case opcodes.TABLE: res = this.matchTable(state, s); break;
		case opcodes.CSTRING: res = this.matchCstring(state, s); break;
		case opcodes.FUNCTION: res = this.matchFunction(state, s); break;
		case opcodes.GRAMMAR: res = this.matchGrammar(state, s); break;
		case opcodes.RULE: res = this.matchRule(state, s); break;
		case opcodes.CONSTANT: res = this.matchConstant(state, s); break;
		case opcodes.MATCHTIME: res = this.matchMatchtime(state, s); break;
		case opcodes.GROUP: res = this.matchGroup(state, s); break;
		case opcodes.SUBSTITUTE: res = this.matchSubstitute(state, s); break;
		case opcodes.RANGE: res = this.matchRange(state, s); break;
		case opcodes.DIFFERENCE: res = this.matchDifference(state, s); break;
		default:
			console.log("DEF:", this.opcode);
			break;
	}
	--state.depth;
	return res;
}

Pattern.prototype.matchString = function(state, s) {
	var todo = s.length - state.idx;
	//console.log(state.indent()+"ms: " + todo + " " + this.v.length, todo >= this.v.length);
	if(todo >= this.v.length) {
		//console.log(state.indent()+"matchString:", this.v, s.substring(state.idx, state.idx+this.v.length));
		for(var i=0; i < this.v.length; ++i) {
			if(s[i+state.idx] != this.v[i]) return false;
		}
		state.idx += this.v.length;
		return true;
	}
	else {
		//console.log(state.indent()+"ms fail", this.v, state.idx);
		return false;
	}
}

Pattern.prototype.matchNumber = function(state, s) {
	if(this.v <= 0) {
		//console.log(state.idx-this.v, s.length);
		var res = (state.idx-this.v) > s.length;
		if(res) ++state.idx;
		return res;
	}
	else if(state.idx+this.v <= s.length) {
		state.idx += this.v;
		return true;
	}
	else {
		//state.resetPosition(state.idx+this.v);
		return false;
	}
}

Pattern.prototype.matchBool = function(state, s) {
	return this.v;
}

Pattern.prototype.matchRep = function(state, s) {
	var sidx = state.idx;
	if(this.v.rep > 0) {
		//console.log(state.indent()+"rep 1:", state.idx);
		for(var i=0; i < this.v.rep; ++i) {
			if(!this.v.pattern.match_(state, s)) {
				state.idx = sidx;
				//console.log(state.indent()+"rep 1:", state.idx);
				return false;
			}
		}
		sidx = state.idx;
		while(this.v.pattern.match_(state, s)) {
			sidx = state.idx;
		}
		state.idx = sidx;
		//console.log(state.indent()+"rep 1:", state.idx);
		return true;
	}
	else if(this.v.rep == 0) {
		//console.log(state.indent()+"rep 0:", state.idx);
		while(this.v.pattern.match_(state, s)) {
			sidx = state.idx;
		}
		state.idx = sidx;
		//console.log(state.indent()+"rep 0:", state.idx);
		return true;
	}
	else {
		//console.log(state.indent()+"rep -1:", state.idx);
		for(var i=0; i < -this.v.rep; ++i) {
			var bidx = sidx;
			if(!this.v.pattern.match_(state, s)) {
				sidx = bidx;
				break;
			}
			sidx = state.idx;
		}
		state.idx = sidx;
		//console.log(state.indent()+"rep -1:", state.idx);
		return true;
	}
}

Pattern.prototype.matchAnd = function(state, s) {
	//console.log("AND:", this.v.p1.match_(state, s), this.v.p2.match_(state, s));
	var sidx = state.idx;
	if(this.v.p1.match_(state, s) && this.v.p2.match_(state, s)) {
		return true;
	}
	else {
		state.resetPosition(sidx);
		return false;
	}
}

Pattern.prototype.matchOr = function(state, s) {
	var sidx = state.idx;
	if(this.v.p1.match_(state, s) || this.v.p2.match_(state, s)) {
		return true;
	}
	else {
		state.resetPosition(sidx);
		return false;
	}
}

Pattern.prototype.matchDifference = function(state, s) {
	var sidx = state.idx;
	//console.log("matchDifference:", state.idx);
	if(this.v.p1.match_(state, s)) {
		var sidx2 = state.idx;
		state.resetPosition(sidx);
		if(this.v.p2.match_(state, s)) {
			state.resetPosition(sidx);
			return false;
		}
		else {
			state.idx = sidx2
		}
		return true;
	}
	else {
		state.resetPosition(sidx);
		return false;
	}
}

Pattern.prototype.matchIgnore = function(state, s) {
	var sidx = state.idx;
	var res = this.v.match_(state, s);
	state.resetPosition(sidx);
	return res;
}

Pattern.prototype.matchSet = function(state, s) {
	if(state.idx >= s.length) return false;
	
	if(this.v[ s[state.idx] ]) {
		++state.idx;
		return true;
	}
	else {
		return false;
	}
}

Pattern.prototype.matchRange = function(state, s) {
	if(state.idx >= s.length) return false;
	
	if(this.v.exec(s[state.idx])) {
		++state.idx;
		return true;
	}
	else {
		return false;
	}
}

Pattern.prototype.matchGrammar = function(state, s) {
	var root = this.v[1];
	if(typeof root == "string") {
		root = this.v[root];
	}
	state.env.push(this.v);
	var sidx = state.idx;
	var res = root.match_(state, s);
	state.env.pop();
	if(!res) {
		state.resetPosition(sidx);
	}
	return res;
}

Pattern.prototype.matchRule = function(state, s) {
	var patt = state.env[state.env.length-1][this.v];
	//console.log(state.indent()+"rule: " + this.v);
	var sidx = state.idx;
	if(patt.match_(state, s)) {
		//console.log(state.indent()+"matchRule:", this.v, true, state.idx);
		return true;
	}
	else {
		state.resetPosition(sidx);
		//console.log(state.indent()+"matchRule:", this.v, false, state.idx);
		return false;
	}
}

Pattern.prototype.matchCapture = function(state, s) {
	var sidx = state.idx;
	state.pushCaptures();
	if(this.v.match_(state, s)) {
		var eidx = state.idx;
		//var cap = new Capture(s.substring(sidx, eidx), sidx, eidx);
		var cap = s.substring(sidx, eidx);
		state.appendCapture(cap);
		state.mergeAndPopCaptures(true);
		return true;
	}
	else {
		state.popCaptures();
		return false;
	}
}

Pattern.prototype.matchPosition = function(state, s) {
	var cap = state.idx;
	if(state.substitute) {
		var cap = new Capture(state.idx, state.idx, state.idx);
		state.addSubstitution(cap);
	}
	else {
		state.captures.push(state.idx);
	}
	return true;
}

Pattern.prototype.matchTable = function(state, s) {
	if(state.substitute) console.error("can't have table capture inside substitution");
	//console.log(state.cindent()+"**matchTable:", state.namedCaptures);
	var sidx = state.idx;
	state.pushCaptures();
	if(this.v.match_(state, s)) {
		var eidx = state.idx;
		var res = state.captures
		state.collectNamedCaptures(res);
		state.popCaptures();
		//var cap = new Capture(res, sidx, eidx);
		var cap = res;
		state.appendCapture(cap);
		return true;
	}
	else {
		state.popCaptures();
		return false;
	}
}

Pattern.prototype.matchCstring = function(state, s) {
	state.pushCaptures();
	var sidx = state.idx;
	if(this.v.pattern.match_(state, s)) {
		var eidx = state.idx;
		var c = this.v.str;
		if(state.substitute) {
			var cap = new Capture(c, sidx, eidx);
			state.addSubstitution(cap);
		}
		else {
			state.appendCapture(c);
		}
		state.mergeAndPopCaptures();
		return true;
	}
	else {
		state.popCaptures();
		return false;
	}
}

Pattern.prototype.matchFunction = function(state, s) {
	state.pushCaptures();
	var sidx = state.idx;
	if(this.v.pattern.match_(state, s)) {
		var eidx = state.idx;
		var c = this.v.f.apply(this, state.captures);
		if(state.substitute) {
			var cap = new Capture(c, sidx, eidx);
			state.addSubstitution(cap);
		}
		else {
			state.appendCapture(c);
		}
		state.mergeAndPopCaptures();
		return true;
	}
	else {
		state.popCaptures();
		return false;
	}
}

Pattern.prototype.matchConstant = function(state, s) {
	if(state.substitute) {
		var cap = new Capture(this.v, s.idx, s.idx);
		state.addSubstitution(cap);
	}
	else {
		//console.log("   Cc:", this.v);
		state.appendCapture(this.v);
	}
	return true;
}

Pattern.prototype.matchMatchtime = function(state, s) {
	state.pushCaptures();
	var sidx = state.idx;
	if(this.v.pattern.match_(state, s)) {
		var eidx = state.idx;
		var args = state.captures
		args.unshift(s);
		args.unshift(eidx);
		args.unshift(sidx);
		args.unshift(state);
		state.popCaptures();
		var res = this.v.f.apply(this, args);
		if(res) {
			return true;
		}
		else {
			return false;
		}
	}
	else {
		state.popCaptures();
		return false;
	}
}

Pattern.prototype.matchGroup = function(state, s) {
	//console.log(state.cindent()+"__matchGroup:", state.namedCaptures);
	state.pushCaptures();
	var sidx = state.idx;
	if(this.v.pattern.match_(state, s)) {
		if(state.captures.length <= 0) {
			var eidx = state.idx;
			//var cap = new Capture(s.substring(sidx, eidx), sidx, eidx);
			var cap = s.substring(sidx, eidx);
			state.appendCapture(cap);
		}
		if(this.v.name) {
			state.nameAndPopCaptures(this.v.name);
		}
		else {
			state.mergeAndPopCaptures(true);
		}
		return true;
	}
	else {
		state.popCaptures();
		return false;
	}
}

Pattern.prototype.matchSubstitute = function(state, s) {
	state.substitute = true;
	var sidx = state.idx;
	if(this.v.match_(state, s)) {
		var eidx = state.idx;
		var res = state.makeSubstitution(s.substring(sidx, eidx), sidx);
		state.appendCapture(res);
		state.substitute = false;
		return true;
	}
	else {
		state.substitute = false;
		return false;
	}
}


return {
	P: function(v, opcode) {
		return new Pattern(v, opcode);
	},
	
	S: function(str) {
		var set = {};
		for(var i=0; i < str.length; ++i) {
			set[ str[i] ] = true;
		}
		return new Pattern(set, opcodes.SET);
	},
	
	R: function(range) {
		if(range == undefined) {
			return new Pattern(false);
		}
		else {
			var regexp
			if(typeof range == "string") {
				if(range[0] <= range[1]) {
					regexp = new RegExp("["+range[0]+"-"+range[1]+"]");
				}
				else {
					return new Pattern(false);
				}
			}
			else if(typeof range == "object") {
				var regexpRanges = [];
				for(var i=0; i < range.length; ++i) {
					var r = range[i];
					if(r[0] <= r[1]) {
						regexpRanges.push(r[0]+"-"+r[1]);
					}
				}
				regexp = new RegExp("["+regexpRanges.join("")+"]");
			}
			return new Pattern(regexp, opcodes.RANGE);
		}
	},
	
	C: function(patt) {
		return new Pattern(patt, opcodes.CAPTURE);
	},
	
	Cp: function() {
		return new Pattern(null, opcodes.POSITION);
	},
	
	Cc: function(v) {
		return new Pattern(v, opcodes.CONSTANT);
	},
	
	Ct: function(patt) {
		return new Pattern(patt, opcodes.TABLE);
	},
	
	V: function(name) {
		return new Pattern(name, opcodes.RULE);
	},
	
	Cstr: function(patt, str) {
		return new Pattern({ pattern:patt, str:str }, opcodes.CSTRING);
	},
	
	Cfunc: function(patt, f) {
		return new Pattern({ pattern:patt, f:f }, opcodes.FUNCTION);
	},
	
	Cmt: function(patt, f) {
		return new Pattern({ pattern:patt, f:f, }, opcodes.MATCHTIME);
	},
	
	Cg: function (patt, name) {
		return new Pattern({ pattern:patt, name:name, }, opcodes.GROUP);
	},
	
	Cs: function(patt) {
		return new Pattern(patt, opcodes.SUBSTITUTE);
	}
};
})();

if(typeof module !== "undefined") {
  module.exports = Pattern;
}