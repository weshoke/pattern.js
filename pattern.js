/*
 * pattern.js 0.1.0
 *
 *
 * Copyright (c) 2013 Wesley Smith
 * Licensend under the MIT license.
 */
 var fs = require('fs');
 
var Pattern = (function(undefined) {

var DEBUG = false;
var CAP_DEBUG = false;

var codegen_debug = function(v) {
	if(CAP_DEBUG) return v;
	else return "";
}

// setup
var opnames = [
	"STRING", "NUMBER", "BOOL", "OBJECT",
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

/*
var Capture = function(v, sidx, eidx) {
	this.v = v;
	this.sidx = sidx;
	this.eidx = eidx;
}
*/

var CodeState = function() {
	this.depth = 1;
	this.uid = 0;
	
	// statically defined values (strings, sets, ranges, grammars)
	this.statics = {};
	this.staticDefs = {};
	
	this.reps = {};
	
	// match results
	this.res = this.makeUID();
	this.resStack = [];
	
	// in-flight ppatterns
	this.currentDefName = undefined;
	this.defNameStack = [];
	this.currentDef = [];	// current pattern being processed
	this.defStack = [];		// stack of patterns in flight
	
	// patterns to process
	this.rule = undefined;
	this.ruleStack = [];
	
	// generated patterns
	this.currentGrammarName = undefined;
	this.grammarNameStack = [];
	this.defs = undefined;	// map of named patterns in current grammar
	this.grammarStack = [];	// stack of grammars in flight
}

CodeState.prototype.registerRep = function(name, pattern) {
	this.reps[pattern.id] = name;
}

CodeState.prototype.getRep = function(pattern) {
	return this.reps[pattern.id];
}

CodeState.prototype.makeUID = function(name) {
	name = name||"res";
	return name+(++this.uid);
}

CodeState.prototype.indent = function() {
	var res = "";
	for(var i=0; i < this.depth; ++i) res += "\t";
	return res;
}

CodeState.prototype.createStatic = function(name, code) {
	if(this.staticDefs[code]) {
		return this.staticDefs[code];
	}
	else {
		var nameUID = this.makeUID(name);
		this.addStatic(nameUID, code);
		this.staticDefs[code] = nameUID;
		return nameUID;
	}
}

CodeState.prototype.addStatic = function(name, code) {
	this.statics[name] = code;
}

CodeState.prototype.append = function(code) {
	for(var i=0; i < code.length; ++i) code[i] = this.indent()+code[i];
	this.currentDef = this.currentDef.concat(code);
}

CodeState.prototype.appendResDeclaration = function() {
	this.append(["var "+this.res+" = false;"]);
}

CodeState.prototype.push = function(name) {
	this.defNameStack.push(this.currentDefName);
	this.currentDefName = name;
	
	this.defStack.push(this.currentDef);
	this.currentDef = [];
}

CodeState.prototype.pop = function(name, grammar) {
	if(grammar && grammar != this.currentGrammarName) {
		for(var i=this.grammarNameStack.length-1; i >= 0; --i) {
			if(grammar == this.grammarNameStack[i]) {
				this.grammarStack[i][this.currentDefName] = {
					def: this.currentDef,
					name: name
				};
			}
		}
	}
	else {
		this.defs[this.currentDefName] = {
			def: this.currentDef,
			name: name
		};
	}
	this.currentDef = this.defStack.pop();
	this.currentDefName = this.defNameStack.pop();
}

CodeState.prototype.defExists = function(name) {
	return this.defs[name] || false;
}

CodeState.prototype.defIsInFlight = function(name) {
	if(this.currentDefName == name) return true;
	for(var i=0; i < this.defNameStack.length; ++i) {
		if(this.defNameStack[i] == name) return true;
	}
	return false;
}

CodeState.prototype.pushRes = function() {
	this.resStack.push(this.res);
	this.res = this.makeUID();
}

CodeState.prototype.popRes = function() {
	this.res = this.resStack.pop();
}

CodeState.prototype.pushRules = function(rules, name) {
	name = name || "grammar";
	//console.log("***> state.pushRules:", name);
	this.grammarNameStack.push(this.currentGrammarName);
	this.currentGrammarName = this.makeUID(name);
	
	this.ruleStack.push(this.rules);
	this.rules = rules;
	this.grammarStack.push(this.defs);
	this.defs = {};
	this.push(0);
	if(DEBUG) console.log(this.indent()+"*** push rules", this.ruleStack.length, rules);
	return this.currentGrammarName;
}

CodeState.prototype.popRules = function(name, res) {
	if(DEBUG) console.log(this.indent()+"*** pop rules", this.ruleStack.length, name);
	this.pop(res);
	
	for(var rule in this.defs) {
		var def = this.defs[rule];
		var code = def.def;
		code.unshift("function(s) {");
		code.push("	return "+def.name+";");
		code.push("}");
		this.addStatic("this."+this.ruleName(name, rule), code.join("\n"));
	}
	
	this.defs = this.grammarStack.pop();
	this.rules = this.ruleStack.pop();
	this.currentGrammarName = this.grammarNameStack.pop();
	
	//console.log("<*** state.popRules:", name);
}

CodeState.prototype.getRule = function(name) {
	if(DEBUG) console.log(this.indent()+"*** getRule", this.ruleStack.length);
	//console.log(this.indent()+"*** getRule", name, this.ruleStack.length);
	var pattern = this.rules[name];
	var grammar = this.currentGrammarName;
	if(this.currentGrammarName.substring(0, 7) != "grammar") {
		var idx = this.grammarNameStack.length-1;
		while(!pattern && idx >= 0) {
			pattern = this.ruleStack[idx][name];
			grammar = this.grammarNameStack[idx];
			if(pattern) break;
			
			if(this.grammarNameStack[idx].substring(0, 7) == "grammar") {
				break;
			}
			--idx;
		}
	}
	return {
		pattern: pattern,
		grammar: grammar
	};
}

CodeState.prototype.ruleName = function(name, rule) {
	return name+"_"+rule;
}

CodeState.prototype.generate = function() {
	var preamble = [
		"var Parser = function() {",
		"	this.idx = 0;",
		"	this.captures = [];",
		"	this.captureStack = [];",
		"	this.namedCaptures = {};",
		"	this.namedCaptureStack = [];",
	];
	for(var k in this.statics) {
		var code = this.statics[k];
		if(k.substring(0, 4) == "this") {
			preamble.push(k+" = "+code+";");
		}
		else {
			preamble.push("var "+k+" = "+code+";");
		}
	}
	preamble.push("this.match = function(s) {");
	var code = preamble.concat(this.currentDef);
	code.push("	if(!"+this.res+") this.resetCaptures();");
	code.push("	return "+this.res+";");
	code.push("};");
	
	var body = [
		"this.pushCaptures = function() {",
		codegen_debug("	console.log('pushCaptures', this.captures);"),
		"	this.captureStack.push(this.captures);",
		"	this.captures = [];",
		"	this.namedCaptureStack.push(this.namedCaptures);",
		"	this.namedCaptures = {};",
		"}",
		"this.popCaptures = function() {",
		codegen_debug("	console.log('popCaptures');"),
		"	this.captures = this.captureStack.pop();",
		"	this.namedCaptures = this.namedCaptureStack.pop();",
		"}",
		"this.mergeAndPopCaptures = function() {",
		codegen_debug("	console.log('merge:', this.captureStack[this.captureStack.length-1], this.captures);"),
		"	var captures = this.captures;",
		"	this.captures = this.captureStack.pop().concat(captures);",
		"	for(var name in captures) {",
		"		var idx = parseInt(name);",
		"		if(isNaN(idx)) {",
		"			this.captures[name] = captures[name];",
		"		}",
		"	}",
		"",
		"	var namedCaptures = this.namedCaptures;",
		"	this.namedCaptures = this.namedCaptureStack.pop();",
		"	for(var name in namedCaptures) {",
		"		this.namedCaptures[name] = namedCaptures[name];",
		"	}",
		"}",
		"this.mergeCapturesAtIndex = function(idx, captures, namedCaptures) {",
		"	for(var i=captures.length-1; i >= 0; --i) {",
		"		this.captures.splice(idx, 0, captures[i]);",
		"	}",
		"	for(var name in captures) {",
		"		var idx = parseInt(name);",
		"		if(isNaN(idx)) {",
		"			this.captures[name] = captures[name];",
		"		}",
		"	}",
		"",
		"	for(var name in namedCaptures) {",
		"		this.namedCaptures[name] = namedCaptures[name];",
		"	}",
		"}",
		// TODO: track indices of captures for better merging
		"this.captureTable = function(idx) {",
		codegen_debug("	console.log('captureTable', idx, this.captures);"),
		"	for(var name in this.namedCaptures) {",
		codegen_debug("		console.log('add named capture:', name);"),
		"		this.captures[name] = this.namedCaptures[name];",
		"	}",
		"	this.namedCaptures = {};",
		"	if(idx > 0) {",
		"		var removed = this.captures.splice(0, idx);",
		"		removed[removed.length] = this.captures;",
		"		this.captures = removed;",
		"	}",
		"	else {",
		"		this.captures = [this.captures];",
		"	}",
		"}",
		"this.captureGroup = function(name) {",
		codegen_debug("	console.log('captureGroup', name, this.captures);"),
		"	if(name) {",
		"		this.namedCaptures[name] = this.captures;",
		"		this.captures = [];",
		"	}",
		"}",
		"this.appendCapture = function(v) {",
		codegen_debug("	console.log('appendCapture', v);"),
		"	this.captures.push(v);",
		"}",
		"this.prependCapture = function(v) {",
		codegen_debug("	console.log('prependCapture', v);"),
		"	this.captures.unshift(v);",
		"}",
		"this.resetCaptures = function(v) {",
		"	this.captures = [];",
		"}",
	];
	code = code.concat(body);
	code.push("}");
	
	return code.join("\n");
}


CodeState.prototype.create = function() {
	var matchCode = this.generate();
	if(DEBUG) console.log(matchCode);
	var code = [matchCode].concat(["return Parser;"]).join("\n");
	return (new Function(code))();;
}

CodeState.prototype.save = function(filename) {
	var matchCode = this.generate();
	fs.writeFile(filename, matchCode, function(err) {
		if(err) console.log(err);
		else console.log("File '"+filename+"'");
	}); 
}

var _patterUID = 0;
var Pattern = function(v, opcode) {
	this.v = v;
	this.id = (++_patterUID);
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
			console.error("invalid pattern input type: "+(typeof v));
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

Pattern.prototype.eval = function() {
	var state = new CodeState();
	state.appendResDeclaration();
	this.match_(state);
	if(DEBUG) console.log("-----------------------------");
	return state.create();
}

Pattern.prototype.save = function(filename) {
	var state = new CodeState();
	state.appendResDeclaration();
	this.match_(state);
	return state.save(filename);
}

Pattern.prototype.match_ = function(state, s) {
	++state.depth;
	//console.log("--> match_:", opcodes[this.opcode]);
	
	var res;
	switch(this.opcode) {
		case opcodes.STRING: res = this.matchString(state, s); break;
		case opcodes.NUMBER: res = this.matchNumber(state, s); break;
		case opcodes.BOOL: res = this.matchBool(state, s); break;
		case opcodes.OBJECT: res = this.matchObject(state, s); break;
		case opcodes.SET: res = this.matchSet(state, s); break;
		case opcodes.RANGE: res = this.matchRange(state, s); break;
		case opcodes.AND: res = this.matchAnd(state, s); break;
		case opcodes.OR: res = this.matchOr(state, s); break;
		case opcodes.REP: res = this.matchRep(state, s); break;
		case opcodes.DIFFERENCE: res = this.matchDifference(state, s); break;
		case opcodes.IGNORE: res = this.matchIgnore(state, s); break;
		case opcodes.GRAMMAR: res = this.matchGrammar(state, s); break;
		case opcodes.RULE: res = this.matchRule(state, s); break;
		case opcodes.CAPTURE: res = this.matchCapture(state, s); break;
		case opcodes.POSITION: res = this.matchPosition(state, s); break;
		case opcodes.CONSTANT: res = this.matchConstant(state, s); break;
		case opcodes.TABLE: res = this.matchTable(state, s); break;
		case opcodes.GROUP: res = this.matchGroup(state, s); break;
		case opcodes.CSTRING: res = this.matchCstring(state, s); break;
		case opcodes.FUNCTION: res = this.matchFunction(state, s); break;
		case opcodes.MATCHTIME: res = this.matchMatchtime(state, s); break;
		case opcodes.SUBSTITUTE: res = this.matchSubstitute(state, s); break;
		default:
			console.error("invalid opcode: "+this.opcode);
			break;
	}
	--state.depth;
	//console.log("<-- match_:", opcodes[this.opcode]);
	return res;
}

Pattern.prototype.matchString = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchString");

	var v = this.v.replace(/\\/g, "\\\\");
	v = v.replace(/'/g, "\\'");
	//console.log("str:", this.v, this.v.length, v, v.length);
	var str = eval("'"+v+"'");
	//console.log("\t"+str, str.length);
	var length = str.length;
	
	var string = state.createStatic("string", "'"+v+"'");
	var i = state.makeUID("i");
	var code = [
		"// Match "+string,
		"if(s.length-this.idx >= "+length+") {",
		"	"+state.res+" = true;",
		"	for(var "+i+"=0; "+i+" < "+length+"; ++"+i+") {",
		"		if(s["+i+"+this.idx] != "+string+"["+i+"]) {",
		"			"+state.res+" = false;",
		"			break;",
		"		}",
		"	}",
		"	if("+state.res+") this.idx += "+length+";",
		"}",
		"else {",
		"	"+state.res+" = false;",
		"}"
	];
	
	state.append(code);
}

Pattern.prototype.matchNumber = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchNumber");
	
	var code;
	if(this.v < 0) {
		code = [
			"// Match number of characters ("+this.v+")",
			state.res+" = (this.idx+"+(-this.v)+") > s.length;",
			"if("+state.res+") ++this.idx;",
		];
	}
	else {
		code = [
			"// Match number of characters ("+this.v+")",
			"if(this.idx+"+this.v+" <= s.length) {",
			"	this.idx += "+this.v+";",
			"	"+state.res+" = true;",
			"}",
			"else {",
			"	"+state.res+" = false;",
			"}"
		];
	}

	state.append(code);
}

Pattern.prototype.matchBool = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchBool");
	
	var code = [
		"// Match bool '"+this.v+"'",
		state.res+" = "+this.v+";"
	];
	
	state.append(code);
}

Pattern.prototype.matchObject = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchBool");
	
	var prevS = state.makeUID("prevS");
	if(typeof this.v.field == "object") {
		var rule = this.getPatternRule(state, s, this.v.field);
		var k = state.makeUID("k");
		state.pushRes();
		state.appendResDeclaration();
		
		var res = state.res;
		var i = state.makeUID("i");
		var tmp = state.makeUID("tmp");
		var cidx = state.makeUID("cidx");
		var sidx = state.makeUID("sidx");
		var sidx2 = state.makeUID("sidx");
		var keyCaptures = state.makeUID("keyCaptures");
		var namedKeyCaptures = state.makeUID("namedKeyCaptures");
		
		state.pushRes();
		state.append([
			"// Match object using pattern",
			//"console.log('indirect:', s);",
			"if(typeof s === 'object' && s !== null) {",
			"	for(var "+k+" in s) {",
			"		var "+state.res+" = false;",
			"		var "+cidx+" = this.captures.length;",
			"		this.pushCaptures();",
			"		var "+sidx+" = this.idx;",
			"		this.idx = 0",
			"		var "+tmp+" = this."+state.ruleName(rule, 0)+"("+k+");",
			//"		console.log('\\n********\\ntmp:', "+tmp+");",
			"		this.idx = "+sidx+";",
			//"		console.log(this.captures, "+k+");",
			"		var "+keyCaptures+" = this.captures;",
			"		var "+namedKeyCaptures+" = this.namedCaptures;",
			"		this.popCaptures();",
			"		if("+tmp+") {",
			"		var "+prevS+" = s;",
			//"			console.log(this.captures);",
			"			s = s["+k+"];",
			//"			console.log("+k+");",
			"			if(s !== undefined) {",
			"				var "+sidx+" = this.idx;",
			"				this.idx = 0",
		]);
		
		state.depth += 3;
		this.v.pattern.match_(state, s);
		state.depth -= 3;
		
		state.append([
			"				this.idx = "+sidx+";",
			"			}",
			//"			console.log('matched:', "+state.res+");",
			"			s = "+prevS+";",
			"		}",
			"		if("+state.res+") {",
			//"			console.log("+keyCaptures+", "+cidx+");",
			"			this.mergeCapturesAtIndex("+cidx+", "+keyCaptures+", "+namedKeyCaptures+");",
			"		}",
			"		"+res+" = "+res+"||"+state.res+";",
			"	}",
			"}"
		]);
		state.popRes();
		
		state.popRes();
		state.append([
			state.res+" = "+res+";"
		]);
	}
	else {
		state.append([
			"// Match object '"+this.v.field+"'",
			//"console.log('\\ndirect "+this.v.field+":', s, typeof s);",
			"if(typeof s === 'object' && s !== null) {",
			"	var "+prevS+" = s;",
			"	s = s['"+this.v.field+"'];",
			"	if(s !== undefined) {"
		]);
		state.depth += 2;
		this.v.pattern.match_(state, s);
		state.depth -= 2;
		state.append([
			"	}",
			"	s = "+prevS+";",
			"}"
		]);
	}
}

Pattern.prototype.matchSet = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchSet");
	
	var setName = state.createStatic("set", JSON.stringify(this.v));
	var code = [
		"// Match set "+setName,
		"if("+setName+"[ s[this.idx] ]) {",
		"	++this.idx;",
		"	"+state.res+" = true;",
		"}",
		"else {",
		"	"+state.res+" = false;",
		"}"
	];
	
	state.append(code);
}

Pattern.prototype.matchRange = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchRange");
	
	var rangeName = state.createStatic("range", this.v.toString());
	var code = [
		"// Match range "+rangeName,
		"if(s[this.idx] &&"+rangeName+".exec(s[this.idx])) {",
		"	++this.idx;",
		"	"+state.res+" = true;",
		"}",
		"else {",
		"	"+state.res+" = false;",
		"}"
	];
	
	state.append(code);
}

Pattern.prototype.matchAnd = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchAnd");
	
	state.append(["// Match p1*p2"]);
	var sidx = state.makeUID("sidx");
	state.append([
		"var "+sidx+" = this.idx;",
		"this.pushCaptures();",
	]);
	
	// First patttern in sequence
	state.pushRes();
		var res1 = state.res;
		state.appendResDeclaration();
		this.v.p1.match_(state, s)
	state.popRes();
	
	// Second pattern in sequence
	state.pushRes();
		var res2 = state.res;
		state.appendResDeclaration();		
		state.append(["if("+res1+") {"]);
		++state.depth;
			this.v.p2.match_(state, s)
		--state.depth;
		state.append(["}"]);
	state.popRes();
	
	// Result
	state.append([
		state.res+" = "+res1+" && "+res2+";",
		"if("+state.res+") {",
		"	this.mergeAndPopCaptures();",
		"}",
		"else {",
		"	this.idx = "+sidx+";",
		"	this.popCaptures();",
		"}"
	]);
}

Pattern.prototype.matchOr = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchOr");
	
	state.append(["// Match p1+p2"]);
	var sidx = state.makeUID("sidx");
	state.append(["var "+sidx+" = this.idx;"]);
	
	// First choice
	state.pushRes();
		var res1 = state.res;
		state.appendResDeclaration();
		this.v.p1.match_(state, s)
	state.popRes();
	
	// Second choice
	state.pushRes();
		var res2 = state.res;
		state.appendResDeclaration();
		state.append([
			"if(!"+res1+") {",
			"	this.idx = "+sidx+";"
		]);
			++state.depth;
			this.v.p2.match_(state, s)
			--state.depth;
		state.append(["}"]);	
	state.popRes();
	
	// Result
	state.append([
		state.res+" = "+res1+" || "+res2+";",
		"if(!"+state.res+") this.idx = "+sidx+";"
	]);
}

Pattern.prototype.getPatternRule = function(state, s, pattern) {
	var rule = undefined;
	if(!state.getRep(pattern)) {
		// Generate the repeated rule
		var depth = state.depth;
		state.depth = 1;
		rule = state.pushRules({}, "rep");
			state.pushRes();
				var res = state.res;
				state.appendResDeclaration();
				pattern.match_(state, s);
			state.popRes();
		state.popRules(rule, res);
		state.depth = depth;
		state.registerRep(rule, pattern);
	}
	else {
		rule = state.getRep(pattern);
	}
	return rule;
}

Pattern.prototype.matchRep = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchRep");
	
	var sidx = state.makeUID("sidx");
	state.append(["var "+sidx+" = this.idx;"]);
	var rule = this.getPatternRule(state, s, this.v.pattern);
	
	if(this.v.rep > 0) {
		var i = state.makeUID("i");
		state.append([
			"// Match p^"+this.v.rep,
			state.res+" = true;",
			"for(var "+i+"=0; "+i+" < "+this.v.rep+"; ++"+i+") {",
			"	if(!this."+state.ruleName(rule, 0)+"(s)) {",
			"		"+state.res+" = false;",
			"		break;",
			"	}",
			"}",
			"if("+state.res+") {",
			"	"+sidx+" = this.idx;",
			"	while(this."+state.ruleName(rule, 0)+"(s)) {",
			"		"+sidx+" = this.idx;",
			"	}",
			"	this.idx = "+sidx+";",
			"}",
			"else {",
			"	this.idx = "+sidx+";",
			"}"
		]);
	}
	else if(this.v.rep == 0) {
		state.append([
			"// Match p^0",
			"while(this."+state.ruleName(rule, 0)+"(s)) {",
			"	"+sidx+" = this.idx;",
			"}",
			"this.idx = "+sidx+";",
			state.res+" = true;"
		]);
	}
	else {
		var i = state.makeUID("i");
		state.append([
			"// Match p^"+this.v.rep,
			"for(var "+i+"=0; "+i+" < "+(-this.v.rep)+"; ++"+i+") {",
			"	var bidx = "+sidx+";",
			"	if(!this."+state.ruleName(rule, 0)+"(s)) {",
			"		"+sidx+" = bidx;",
			"		break;",
			"	}",
			"	"+sidx+" = this.idx;",
			"}",
			"this.idx = "+sidx+";",
			state.res+" = true;"
		]);
	}
}

Pattern.prototype.matchDifference = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchDifference");
	state.append(["// Match p1+p2"]);

	var sidx1 = state.makeUID("sidx");
	state.append(["var "+sidx1+" = this.idx;"]);
	
	// Left-hand pattern	
	state.pushRes();
		var res1 = state.res;
		state.appendResDeclaration();
		this.v.p1.match_(state, s)
	state.popRes();
	
	var sidx2 = state.makeUID("sidx");
	state.append(["var "+sidx2+" = this.idx;"]);
	
	// Right-hand pattern
	state.pushRes();
		var res2 = state.res;
		state.appendResDeclaration();
		state.append([
			"if("+res1+") {",
			"	this.idx = "+sidx1+";"
		]);
			++state.depth;
			this.v.p2.match_(state, s)
			--state.depth;
		state.append(["}"]);
	state.popRes();
	
	// Result
	state.append([
		state.res+" = "+res1+" && !"+res2+";",
		"if("+state.res+") this.idx = "+sidx2+";",
		"else this.idx = "+sidx1+";"
	]);
}

Pattern.prototype.matchIgnore = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchIgnore");
	var sidx = state.makeUID("sidx");
	state.append(["var "+sidx+" = this.idx;"]);
	this.v.match_(state, s);
	state.append(["this.idx = "+sidx+";"]);
}

Pattern.prototype.matchGrammar = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchGrammar");

	var root = this.v[0];
	if(typeof root == "string") {
		root = new Pattern(root, opcodes.RULE)
	}
	
	var sidx = state.makeUID("sidx");
	state.append(["var "+sidx+" = this.idx;"]);
	
	// Generate the grammar rules
	var depth = state.depth;
	state.depth = 1;
	var grammar = state.pushRules(this.v);
		state.pushRes();
			var res = state.res;
			state.appendResDeclaration();
			root.match_(state, s);
		state.popRes();
	state.popRules(grammar, res);
	if(DEBUG) console.log(state.indent()+"Grammar done");
	state.depth = depth;
	
	state.append([
		state.res+" = this."+state.ruleName(grammar, 0)+"(s);",
		"if(!"+state.res+") this.idx = "+sidx+";"
	]);
}

Pattern.prototype.matchRule = function(state, s) {
	// Check if the rule has already been defined or is being defined
	if(DEBUG) console.log(state.indent()+"matchRule '"+this.v+"'");
	var rule = state.getRule(this.v);
	if(!(state.defIsInFlight(this.v) || state.defExists(this.v))) {
		if(!rule.pattern) console.error("Grammar has no definition for '"+this.v+"'");
		
		// Generate the rule
		var depth = state.depth;
		state.depth = 1;
		state.push(this.v);
			state.pushRes();
				var res = state.res;
				state.appendResDeclaration();
				rule.pattern.match_(state, s);	
			state.popRes();
		state.pop(res, rule.grammar);
		state.depth = depth;
	}
	
	// Call the rule's pattern
	var sidx = state.makeUID("sidx");
	state.append([
		codegen_debug("console.log('-----> match rule:', '"+this.v+"', this.captures);"),
		"var "+sidx+" = this.idx;",
		state.res+" = this."+state.ruleName(rule.grammar, this.v)+"(s);",
		"if(!"+state.res+") this.idx = "+sidx+";",
		codegen_debug("console.log('<----- match rule:', "+state.res+", '"+this.v+"', this.captures);"),
	]);
}

Pattern.prototype.matchCapture = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchCapture");
	
	var sidx = state.makeUID("sidx");
	var cap = state.makeUID("cap");
	var capidx = state.makeUID("capidx");
	state.append([
		"// Capture",
		"var "+sidx+" = this.idx;",
		"var "+capidx+" = this.captures.length;",
		"this.pushCaptures();",
	]);
	this.v.match_(state, s)
	state.append([
		"if("+state.res+") {",
		"	var "+cap+";",
		"	if(typeof s == 'string') {",
		"		"+cap+" = s.substring("+sidx+", this.idx);",
		"	}",
		"	else if(typeof s == 'object') {",
		"		if(s.constructor === Array) {",
		"			"+cap+" = s.slice("+sidx+", this.idx);",
		"		}",
		"		else {",
		"			"+cap+" = s;",
		"		}",
		"	}",
		"	this.mergeAndPopCaptures();",
		//"	console.log('capture', s, this.captures.length, "+capidx+", this.captures);",
		"	this.captures.splice("+capidx+", 0, "+cap+");",
		"}",
		"else {",
		"	this.popCaptures();",
		"}"
	]);
}

Pattern.prototype.matchPosition = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchPosition");
	state.append([
		"// Capture position",
		state.res+" = true;",
		"this.appendCapture(this.idx);"
	]);
}

Pattern.prototype.matchConstant = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchConstant");
	
	var v;
	if(typeof this.v == "string") v = "'"+this.v+"'";
	else v = this.v;
	state.append([
		"// Capture constant '"+this.v+"'",
		state.res+" = true;",
		"this.appendCapture("+v+");"
	]);
}

Pattern.prototype.matchTable = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchTable");
	var capidx = state.makeUID("capidx");
	state.append([
		"// Capture table",
		"var "+capidx+" = this.captures.length;",
	]);
	this.v.match_(state, s);
	state.append([
		"if("+state.res+") this.captureTable("+capidx+");",
	]);
}

Pattern.prototype.matchGroup = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchGroup");
	
	state.append([
		"// Capture group '"+this.v.name+"'",
		"this.pushCaptures();",
	]);
	this.v.pattern.match_(state, s);
	state.append([
		"if("+state.res+") {",
		"	this.captureGroup('"+this.v.name+"');",
		"	this.mergeAndPopCaptures();",
		"}",
		"else {",
		"	this.popCaptures("+state.res+");",
		"}"
	]);
}

Pattern.prototype.matchCstring = function(state, s) {
	if(DEBUG) console.log(state.indent()+"matchCstring");
	this.v.pattern.match_(state, s)
}

Pattern.prototype.matchFunction = function(state, s) {
	console.log(state.indent()+"matchFunction");
	this.v.pattern.match_(state, s)
}

Pattern.prototype.matchMatchtime = function(state, s) {
	console.log(state.indent()+"matchMatchtime");
	this.v.pattern.match_(state, s)
}

Pattern.prototype.matchSubstitute = function(state, s) {
	console.log(state.indent()+"matchSubstitute");
}


var M = {
	P: function(v, opcode) {
		return new Pattern(v, opcode);
	},
	
	O: function(field, pattern) {
		return new Pattern({ field:field, pattern:pattern }, opcodes.OBJECT);
	},
	
	S: function(str) {
		var set = {};
		if(typeof str == "string") {
			for(var i=0; i < str.length; ++i) {
				set[ str[i] ] = true;
			}
		}
		else if(typeof str == "object") {
			if(str.constructor == Array) {
				for(var i=0; i < str.length; ++i) {
					set[ str[i] ] = true;
				}
			}
			else {
				set = str;
			}
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


/* Built-in patterns
*/
var space = M.S(" \t\r\n");
var whitespace = space.rep(0);
var nonzero = M.R("19");
var zero = M.P("0");
var digit = M.R("09");
var char = M.R(["az", "AZ"]);
var idchar = char.or("_");
var hexadecimalDigit = M.R(["09", "af", "AF"]);
var bool = M.P("false").or(M.P("true"));
var integer = M.P("-").rep(-1).and(zero.or(nonzero.and(digit.rep(0))));
var fractional = digit.rep(0);
var scientific = M.S("eE").and(M.S("-+").rep(-1)).and(fractional);
var float = M.P("-").rep(-1).and(
	M.P(".").and(fractional).or(integer.and(M.P(".")).and(fractional.rep(-1)).and(scientific.rep(-1)))
);
var stringEscapes = M.S(["\\\"", "\\\\", "\\b", "\\f", "\\n", "\\r", "\\t"]);
//var stringEscapes = M.P("\\\"").or(M.P("\\\\")).or(M.P("\\b"))
//	.or(M.P("\\f")).or(M.P("\\n")).or(M.P("\\r")).or(M.P("\\t"))
	//.or(
	//	M.P("\\u").and(digit).and(digit).and(digit).and(digit)
	//);
//	;
var string = M.P('"').and(
	stringEscapes.or(M.P('"').invert()).rep(0)
	//M.P('"').invert().rep(0)
).and(M.P('"'));
var singleQuoteString = M.P("'").and(
	stringEscapes.or(M.P("\\'")).or(M.P("'").invert()).rep(0)
).and(M.P("'"));
var identifier = idchar.and(idchar.or(digit).rep(0));

M.patterns = {
	space: space,
	whitespace: whitespace,
	nonzero: nonzero,
	zero: zero,
	digit: digit,
	char: char,
	idchar: idchar,
	hexadecimalDigit: hexadecimalDigit,
	bool: bool,
	integer: integer,
	fractional: fractional,
	scientific: scientific,
	float: float,
	string: string,
	singleQuoteString: singleQuoteString,
	stringEscapes: stringEscapes,
	identifier: identifier
};


/* Pattern utility functions
*/

var field = function(k, v) {
	return M.Cg(M.Cc(v), k);
}

var tag = function(patt, k, v) {
	return patt.and(field(k, v));
}

var Token = function(patt, name) {
	if(name) return M.Ct(tag(M.C(patt), "token", name));
	else return M.P(patt);
}

var Rule = function(patt, name) {
	return M.Ct(tag(patt, "rule", name));
}

/* The grammar for parsing .pattern files
*/
var ws = whitespace
var singleQuote = M.P("'");
var doubleQuote = M.P('"');

var literal = M.V("number").or(M.V("doubleQuoteString")).or(M.V("singleQuoteString")).or(M.V("bool"));
var subexpression = M.P("(").and(ws).and(M.V("additive_expression")).and(ws).and(M.P(")"));
var primary_value = M.V("subexpression").or(M.V("identifier")).or(M.V("literal"));
var function_args = (M.P("(").and(ws).and(
	(M.V("additive_expression").and(ws).and( M.P(",").and(ws).and(M.V("additive_expression").and(ws)).rep(0) )).rep(-1)
).and(M.P(")"))).or(M.V("singleQuoteString").or(M.V("doubleQuoteString")));
var function_call = M.V("identifier").and(M.V("function_args")).or(M.V("primary_value"));

var repetition_expression = M.V("function_call").and(
	ws.and(M.C(M.P("^"))).and(ws).and(M.V("number")).rep(0)
);

var and_expression = M.V("repetition_expression").and(
	ws.and(M.C(M.P("*"))).and(ws).and(M.V("repetition_expression")).rep(0)
);

var additive_expression = M.V("and_expression").and(
	ws.and(M.C(M.P("+").or(M.P("-")))).and(ws).and(M.V("and_expression")).rep(0)
);

var assignment_expression = M.V("identifier").and(
	ws.and(M.C(M.P("="))).and(ws).and(M.V("additive_expression")).rep(0)
);

var expression_statement = M.V("assignment_expression").and(ws).and(M.P(";"));
var label_statement = M.V("identifier").and(M.P(":"));
var statement_list = (M.V("expression_statement").or(M.V("label_statement"))).and(ws).rep(0);


var patternParser  = M.P({
	0: "statement_list",
	statement_list: Rule(statement_list, "statement_list"),
	label_statement: Rule(label_statement, "label_statement"),
	expression_statement: Rule(expression_statement, "expression_statement"),
	assignment_expression: Rule(assignment_expression, "assignment_expression"),
	additive_expression: Rule(additive_expression, "additive_expression"),
	and_expression: Rule(and_expression, "and_expression"),
	repetition_expression: Rule(repetition_expression, "repetition_expression"),
	function_call: Rule(function_call, "function_call"),
	function_args: Rule(function_args, "function_args"),
	primary_value: Rule(primary_value, "primary_value"),
	subexpression: Rule(subexpression, "subexpression"),
	literal: literal,
	identifier: Token(identifier, "identifier"),
	number: Token(integer, "number"),
	doubleQuoteString: Token(string, "doubleQuoteString"),
	singleQuoteString: Token(singleQuoteString, "singleQuoteString"),
	bool: Token(bool, "bool"),
}).and(-1)
//.save(__dirname+"/grammar.pattern");
.eval();



var evalPattern = function(code) {
	var parser = new patternParser();
	//console.log(parser);
	var ast = parser.match(code);
	if(ast) {
		console.log(ast);
		return parser.captures[0];
	}
};

var assert = function(v, msg) {
	if(!v) throw msg;
	return v;
}


function Interpreter() {
	this.definitions = {};
	this.currentCategory = "anonymous";
	this.code = [];
}

Interpreter.prototype.getCategory = function(name) {
	if(!this.categories[name]) this.categories[name] = {};
	return this.categories[name];
}

Interpreter.prototype.registerDefinition = function(name, pattern) {
	var def = {
		name: name,
		pattern: pattern,
		category: this.currentCategory
	};
	this.definitions[name] = def;
}

Interpreter.prototype.eval = function(ast) {
	this.dispatch(ast);
	var grammar = {};
	for(var k in M.patterns) {
		grammar[k] = M.patterns[k];
	}
	
	for(var name in this.definitions) {
		var def = this.definitions[name];
		this.currentCategory = def.category;
		if(def.category == "tokens") {
			def.match = Token(this.dispatch(def.pattern), name);
		}
		else if(def.category == "rules") {
			def.match = Rule(this.dispatch(def.pattern), name);
		}
		else {
			def.match = this.dispatch(def.pattern);
		}
		grammar[name] = def.match;
	}
	grammar[0] = "root";
	var patt = M.P(grammar);
	return patt;
}

Interpreter.prototype.makePattern = function(ast) {
	if(ast.rule) {
		return this[ast.rule].call(this, ast);
	}
	else if(ast.token) {
		if(ast.token == "doubleQuoteString" || ast.token == "singleQuoteString") {
			return ast[0].substring(1, ast[0].length-1);
		}
		else if(ast.token == "identifier") {
			return M.V(ast[0]);
		}
		else if(ast.token == "number") {
			return parseInt(ast[0]);
		}
		else if(ast.token == "bool") {
			return ast[0] == "true";
		}
	}
}

Interpreter.prototype.dispatch = function(ast) {
	if(ast.rule) {
		return this[ast.rule].call(this, ast);
	}
	else if(ast.token) {
		return ast;
	}
}

Interpreter.prototype.dispatchList = function(ast) {
	if(ast.rule) {
		for(var i=0; i < ast.length; ++i) {
			var node = ast[i];
			this[node.rule].call(this, node);
		}
	}
	else if(ast.token) {
		return ast;
	}
}

Interpreter.prototype.statement_list = function(ast) {
	this.dispatchList(ast);
}

Interpreter.prototype.label_statement = function(ast) {
	var name = this.dispatch(ast[0]);
	assert(name.token && name.token == "identifier", "identifier expected");
	this.currentCategory = name[0];
}

Interpreter.prototype.expression_statement = function(ast) {
	var expr = this.dispatch(ast[0]);
	this.registerDefinition(expr.name, expr.pattern);
}

Interpreter.prototype.assignment_expression = function(ast) {
	var name = this.dispatch(ast[0]);
	assert(name.token && name.token == "identifier", "identifier expected");
	
	return {
		name: name[0],
		pattern: ast[2]
	};
}

Interpreter.prototype.additive_expression = function(ast) {
	var res = undefined;
	for(var i=0; i < ast.length; i += 2) {
		if(!res) {
			res = this.makePattern(ast[i]);
		}
		else {
			if(res == 1) res = M.P(res);
		
			if(ast[i-1] == '+') res = res.or(this.makePattern(ast[i]));
			else res = res.sub(this.makePattern(ast[i]));
		}
	}
	return res;
}

Interpreter.prototype.and_expression = function(ast) {
	var res = undefined;
	for(var i=0; i < ast.length; i += 2) {
		if(!res) res = this.makePattern(ast[i]);
		else {
			if(this.currentCategory == "rules") {
				res = res.and(ws).and(this.makePattern(ast[i]));
			}
			else {
				res = res.and(this.makePattern(ast[i]));
			}
		}
	}
	return res;
}

Interpreter.prototype.repetition_expression = function(ast) {
	if(ast.length >= 2) {
		var patt = this.makePattern(ast[0]);
		if(patt.opcode == opcodes.GRAMMAR) {
			console.log(ast);
			printAST(ast);
			error("");
		}
		var n = this.makePattern(ast[2]);
		if(this.currentCategory == "rules") {
			return patt.and(ws).rep(n);
		}
		else {
			return patt.rep(n);
		}
	}
	else {
		return this.makePattern(ast[0]);
	}
}

Interpreter.prototype.function_call = function(ast) {
	if(ast.length >= 2) {
		var name = this.dispatch(ast[0]);
		assert(name.token && name.token == "identifier", "identifier expected");
		var args = this.makePattern(ast[1]);
		
		var fname = name[0];
		if(fname == "T") {
			return Token(args[0]);
		}
		else {
			assert(M[fname], "invalid function name '"+fname+"'");
			return M[fname].apply(M, args);
		}
	}
	else {
		return this.makePattern(ast[0]);
	}
}

Interpreter.prototype.function_args = function(ast) {
	var res = [];
	for(var i=0; i < ast.length; ++i) res[i] = this.makePattern(ast[i]);
	return res;
}

Interpreter.prototype.primary_value = function(ast) {
	return this.makePattern(ast[0]);
}

Interpreter.prototype.subexpression = function(ast) {
	return this.makePattern(ast[0]);
}


M.create = function(def) {
	var ast = evalPattern(def);
	//console.log(ast);
	//printAST(ast);
	var interpreter = new Interpreter();
	return interpreter.eval(ast);
}


var indent = function(n) {
	var res = "";
	for(var i=0; i < n; ++i) res += "  ";
	return res;
}

var printAST = function(ast, lvl, name) {
	if(!lvl) lvl = 0;
	if(name) console.log(indent(lvl)+name+" = {");
	else console.log(indent(lvl)+"{");
	
	if(ast.rule) console.log(indent(lvl+1)+"rule = "+ast.rule+",");
	else console.log(indent(lvl+1)+"token = "+ast.token+",");
	for(var i=0; i < ast.length; i++) {
		var v = ast[i];
		if(typeof v == "object") {
			printAST(v, lvl+1);
		}
		else {
			console.log(indent(lvl+1)+v+",");
		}
	}
	console.log(indent(lvl)+"}");
}

M.printAST = printAST;

return M;
})();

if(typeof module !== "undefined") {
  module.exports = Pattern;
}
