pattern.js
==========

A PEG-based pattern matching parser generator

pattern.js iherits ideas from [LPEG](http://www.inf.puc-rio.br/~roberto/lpeg/) and [OMeta](http://tinlizzie.org/ometa/).  The interface largely follows that of LPEG, differing mainly where JavaScript and Lua diverge in terms of functionality. pattern.js can be used to generate string parsers as well as match patterns within hierarchical data structures.

## Using pattern.js ##
Pattern.js is a library of composable pattern generating functions for processing strings and hierarchical data structures.  It produces patterns that can be used to match against input strings and objects.  In addition, pattern.js contains a mini-DSL for composing complex patterns and grammars in a succint syntax (see [Pattern DSL](#DSL)).

#### Bird's Eye View ####
Patterns in pattern.js get created in stages.  At first, patterns created are retained as composable units.  This enables patterns to be created incrementally instead of all at once, making pattern creation a more modular process.  To actually use a pattern to process anything, they need to be evaluated and instantiated as a parser object.  The workflow looks like this:

1. Compose pattern
2. Evaluate pattern
3. Instantiate parser from evaluated pattern
4. Use parser to process input

In Javascript, a typical sequence might look like:

```js
var pattern = P("a").and("b");	// 1. Compose pattern
var Parser = pattern.eval();	// 2. Evaluate pattern, creating a Parser class
var parser = new Parser();		// 3. Instantiate a Parser
parser.match("ab");				// 4. Process input (matches "ab")
```
Parsers are stateful objects, tracking information about the parsing process as they match input.  In order to reuse a parser, it must first be reset:

```js
parser.match("ab");	
parser.reset();
parser.match("abc");
```

### Pattern Primitives ###
The set of pattern generating functions closely follows the LPEG interface.  There are a handful of primitive pattern types and operators to combine primitive patterns into more complex composite structures.  The primitive pattern type are:

* P: Matches literals or character sequences
* S: Matches a set of characters
* R: Matches a range of characters
* O: Matches object fields
* Op: Matches parent objects

The __P__ pattern can take a range of different argument types.  Depending on the argument type, __P__ will have slightly different behavior:

* P(true): Always matches, doesn't consume input
* P(false): Never matches
* P(n) where n>=0: Match exactly *n* characters
* P(-n) where n>0: Match only if there are less than *n* characters left
* P(object): Create a grammar from *object*, see [Grammars](#Grammars)

The __S__ pattern matches a set of characters.  The characters are given by a string argument:

* S(string): Match any character in *string*
* S(object): Match any character in *object*'s keys, keys can only be single characters

```js
S("abc") // match 'a', 'b', or 'c'
S({A:true, B:true, C:true}) // match 'A', 'B', or 'C
```

The __R__ pattern matches ranges of characters.  The ranges are specified by two character strings.

* R(string): Match the range of characters *string[0]* to *string[1]*
* R(array): Match characters in the ranges provided by *array*

```js
R("az") // match lower-case letters
R(["az", "AZ"]) // match upper- and lower-case letters
```

The __O__ pattern matches object fields.  It enables patterns to be matched again tree structures such as JSON object hierarchies or ASTs.  __O__ takes one argument specifying the key to lookup in the object and a second argument specifying a pattern to match against the looked up value.

```js
O("key", P("value")) // match {key:"value"}
O(P("k"), P("v")) // match an of the fields in {k:"v", key:"v", ke:"value"}
```

The first argument to __O__ can either be a string literal or a pattern.  If it's a literal, the field is directly looked up in the object.  This is analagous to the "member expression" syntax in javascript:

```js
object.key // member expression
```

If the first argument is a pattern, then the pattern is matched against all of the object's keys.  If a key matches, then the value is looked up in the object and matched against the value pattern.  This is analagous to the javascript "member lookup expression" syntax:

```js
object[key] // member lookup expression
```

The __O__ function does not advance the current index of the parser.  It matches if any match against an object's value is successful.  For cases where the first argument is a pattern and multiple values can be matched, if any of the values match, then the entire match will be successful.

Captures (see [Captures](#Captures)) can be applied to any pattern given as an argument to __O__ and are treated no differently.  As a result, the keys that lookup values producing successful matches can be captured during the matching process.  For example:

```js
// will produce captures for any key starting with a 'k' 
// whose value starts with a 'v'
O(C(P("k")), P("v"))
```

The __Op__ function complements the __O__ function.  While __O__ traverses down a hiearchy, __Op__ traverses up a hiearchy.  It makes parent objects the subject of matching.

* Os(offset): Where offset is 0, matches the current subject
* Os(offset, pattern): Traverse *offset* steps up the hierarchy and apply __pattern__ to the result

Offset must be either 0 or a negative number.  If 0, it simply grabs the current object and no pattern is needed.  If the offset goes beyond the top of the hiearchy, it will fail to match.

```js
// match {key: {another:"value"} } and produce {another:"value"} as a capture
O("key", C(Op(0))) 
// match {key: {another:"value"} } and produce {another:"value"} as a capture
O("key", O("another", Op(-1, C(Op(0)))))
```

### Pattern Operators ###
Pattern operators transform and compose pattern primitives and composites.  The operators are:

* and(p1, p2): sequence, matches *p1* *followed by* *p2*
* or(p1, p2): ordered choice, matches *p1* if succesful else matches *p2*
* rep(p, n) where n>=0: matches *n* *or more* repetitions of pattern *p*
* rep(p, -n) where n>0: matches *at most* *n* repetitions of pattern *p*
* sub(p1, p2): set difference, matches only if *p1* matches and *p2* *doesn't* match
* invert(p): set inversion, matches only if *p* *doesn't* match

### <a name="Grammars">Grammars</a> ###
In addition to the basic operators, patterns can be composed into inter-dependent rule networks, forming a grammar.  Grammars are composed of rule definitions where each definition is a pattern.  Rule definitions can reference other named rules through the rule operator __V__.  __V__ references grammar rules by name and behaves just like other pattern primitives.

* V(name): Matches pattern *name* defined in a grammar

Rule references are only valid within the context of a grammar.  Grammars are defined using the __P__ primitive where the argument to __P__ is an object whose keys name the set of rules defined in the grammar.  For example:

```js
P({
	0: "sequence",
	sequence: V("A").and(V("B").rep(2)).and(V("A")),
	A: S("aA"),
	B: S("bB")
})
```

In the above grammar there are three rules defined: *sequence*, *A*, and *B*.  The entry point for the grammar or "root rule" is indicated in the field __0__.  The value of __0__ can be either a name or a pattern.  Here, it names *sequence* as the entry point.  *sequence* in turn refers to rules *A* and *B*.

### <a name="Captures">Captures</a> ###
When a pattern is matching some input string or object, it can save and process parts of the input using captures.  Captures are useful for collecting important parts of the input and building useful data structures out of them.  For example, a parser might construct an AST from an input string using captures.

#### Basic Captures ####
At its simplest, a capture simply takes the part of the input that a pattern matches and saves it.  If the pattern being capture doesn't match, then no capture is produced.  The basic capture function is __C__:

* C(patt): Capture the value matched by *patt*

```js
C(P("a").and(P("b"))	// match "ab" and produce the captured value "a"
```

Captures can be nested just like other patterns.  In such cases, nested captured values will be generated.  For example:

```js
C(C(P("a").and(P("b"))) // match "ab" and produce the captures "ab" and "a"
```

In addition to the basic __C__ capture function, there are a couple of other basic capture functions:

* Cc: capture a constant value
* Cp: capture the current position of the pattern matcher

__Cc__ produces a constant value. It always matches successfully.

* Cc(constant): create a capture with value *constant*

```js
P("a").and(Cc("constant")) // match "a" and produce the capture "constant"
```

__Cp__ produces the current position of the pattern matcher as a capture

* Cp(): create a capture with value position

```js
// match "a" and produce the capture with value '1' 
// (the position in the pattern where Cp was encountered
P("a").and(Cp()) 
```

#### Advanced Captures ####
Beyond the captures that simply generate capture values, there are capture functions that can transform already generated captures.  These functions serve to group and name generated captures, building data structures as the pattern matches its input.  These functions are:

* Cg: group captured values
* Ct: collect captured values in an object (aka table)

These two functions go hand in hand.  __Cg__ groups captures with a name.  When named captures are collected into an object, their name is used as a key to store the captures in the object.  Unnamed captures, when collected into an object, are simply inserted in order at numeric indices.

* Cg(patt, name): set the name *name* for the captures generated by *patt*
* Ct(patt): group the captures generated by *patt* into an object

```js
// match "ab" and produce the capture ["b", first:"a"]
Ct(Cg(P("a"), "first").and(C("b")))
```

When __Ct__ collects captures into an object, the object used is an Array.  The enables the length property of the Array to be used to ask how many unnamed captures are in the object.  

### <a name="DSL">Pattern DSL</a> ###
To make composing patterns clearer and more succinct, there is a pattern syntax based on LPEG's operators.  The pattern syntax makes use of all of the functions described above.  All it does is exchange object methods such as .and() for binary operators like '*':

* patt1.and(patt2) → patt1*patt2
* patt1.or(patt2) → patt1+patt2 
* patt1.rep(N) → patt1^N
* patt1.sub(patt2) → patt1 - patt2
* patt1.invert() → 1-patt1	// match a single character but don't match patt1

In addition, for function calls where a string is the only argument the parenthesis are optional:

* P("a") is equivalent to P"a"

The pattern DSL can be used to compile both basic basic rule expressions as well as complex grammars.  The __eval__ function parses a pattern string and returns a pattern.  The returned pattern is just like patterns generated using the functions described above, so it can be intermingled with other, lower level functions.  

```js
P"a"*P"b" // match "ab"
```

```js
C(P"a")*P"b" // match "ab" and produce the capture "a"
```

Rules for grammars are specified using assignment:

```js
root = a*b;
a = P"a";
b = P"b";
```
The above definition creates 3 rules for a grammar.  The definitions can come in any order, so a particular rule can reference a rule defined later without issue.  This is often relied upon since grammars tend to have cycles in their definition.  For the *root* rule above, the variables *a* and *b* are referenced.  Variable names refer to rule definitions are are equivalent to using the __V__ pattern function.  The above pattern in the DSL is equivalent to the following:

```js
P({
	0: "root",
	root: V("a").and(V("b")),
	a: P("a"),
	b: P("b")
})
```

Notice that the 0-rule for the grammar is automatically set to the name "root".  The root variable has the special designation of being the entry point into the grammar.  It must always be defined.  For patterns defined simply as expressions (i.e. no assignments), the expression is set as the root of the grammar.