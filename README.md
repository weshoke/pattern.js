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

The __P__ pattern can take a range of different argument types.  Depending on the argument type, __P__ will have slightly different behavior:

* P(true): Always matches, doesn't consume input
* P(false): Never matches
* P(n) where n>=0: Match exactly *n* characters
* P(-n) where n>0: Match only if there are less than *n* characters left
* P(object): Create a grammar from *object*, see [Grammars]

The __S__ pattern matches a set of characters.  The characters are given by a string argument:

* S(string): Match any character in __string__

```js
S("abc") // match 'a', 'b', or 'c'
```

The __R__ pattern matches ranges of characters.  The ranges are specified by two character strings.

* R(string): Match the range of characters __string[0]__ to __string[1]__
* R(array): Match characters in the ranges provided by __array__

```js
R("az") // match lower-case letters
R(["az", "AZ"]) // match upper- and lower-case letters
```

### Pattern Operators ###
Pattern operators transform and compose pattern primitives and composites.  The operators are:

* and(p1, p2): sequence, matches __p1__ *followed by* __p2__
* or(p1, p2): ordered choice, matches __p1__ if succesful else matches __p2__
* rep(p, n) where n>=0: matches __n__ *or more* repetitions of pattern __p__
* rep(p, -n) where n>0: matches *at most* __n__ repetitions of pattern __p__
* sub(p1, p2): set difference, matches only if __p1__ matches and __p2__ *doesn't* match
* invert(p): set inversion, matches only if __p__ *doesn't* match

### Grammars ###
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