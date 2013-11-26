pattern.js
==========

A PEG-based pattern matching parser generator

pattern.js iherits ideas from [LPEG](http://www.inf.puc-rio.br/~roberto/lpeg/) and [OMeta](http://tinlizzie.org/ometa/).  The interface largely follows that of LPEG, differing mainly where JavaScript and Lua diverge in terms of functionality. pattern.js can be used to generate string parsers as well as match patterns within hierarchical data structures.


## Using pattern.js ##
Pattern.js has two interfaces: a high-level grammar-oriented interface and a low-level pattern composition interface.  The high-level interface is intended for constructing parsers that produce abstract syntax trees but can also be used to construct simple patterns with a clearer syntax than is possible directly in JavaScript using the low-level interface.

### Pattern Primitives ###
The set of pattern generating functions closely follows the LPEG interface.  There are a handful of primitive pattern types and operators to combine primitive patterns into more complex composite structures.  The primitive pattern type are:

* P: Matches literals or character sequences
* S: Matches a set of characters
* R: Matches a range of characters
* O: Matches object fields

The __P__ pattern can take a range of different argument types.  Depending on the argument type, __P__ will have slightly different behavior:

* P(true): Always matches, doesn't consume input
* P(false): Never matches
* P(n) where n>=0: Match exactly *n* characters
* P(-n) where n>0: Match only if there are less than *n* characters left
* P(object): Create a grammar from *object*, see [Grammars](#Grammars)

The __S__ pattern matches a set of characters.  The characters are given by a string argument:

* S(string): Match any character in __string__
* S(object): Match any character in __object__'s keys, keys can only be single characters

```js
S("abc") // match 'a', 'b', or 'c'
S({A:true, B:true, C:true}) // match 'A', 'B', or 'C
```

The __R__ pattern matches ranges of characters.  The ranges are specified by two character strings.

* R(string): Match the range of characters __string[0]__ to __string[1]__
* R(array): Match characters in the ranges provided by __array__

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

Captures (see [Captures]) can be applied to any pattern given as an argument to __O__ and are treated no differently.  As a result, the keys that lookup values producing successful matches can be captured during the matching process.  For example:

```js
// will produce captures for any key starting with a 'k' 
// whose value starts with a 'v'
O(C(P("k")), P("v"))
```

### Pattern Operators ###
Pattern operators transform and compose pattern primitives and composites.  The operators are:

* and(p1, p2): sequence, matches __p1__ *followed by* __p2__
* or(p1, p2): ordered choice, matches __p1__ if succesful else matches __p2__
* rep(p, n) where n>=0: matches __n__ *or more* repetitions of pattern __p__
* rep(p, -n) where n>0: matches *at most* __n__ repetitions of pattern __p__
* sub(p1, p2): set difference, matches only if __p1__ matches and __p2__ *doesn't* match
* invert(p): set inversion, matches only if __p__ *doesn't* match

### <a name="Grammars">Grammars</a> ###
In addition to the basic operators, patterns can be composed into inter-dependent rule networks, forming a grammar.  Grammars are composed of rule definitions where each definition is a pattern.  Rule definitions can reference other named rules through the rule operator __V__.  __V__ references grammar rules by name and behaves just like other pattern primitives.

* V(name): Matches pattern __name__ defined in a grammar

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

### High-Level Interface ###

### Low-Level Interface ###