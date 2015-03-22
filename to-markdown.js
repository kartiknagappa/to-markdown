/*
 * to-markdown - an HTML to Markdown converter
 *
 * Copyright 2011-15, Dom Christie
 * Licenced under the MIT licence
 *
 */

'use strict';

var he = require('he');

var _document = require('./lib/document');
var converters = require('./lib/md-converters');

var isRegExp = require('./lib/utilities').isRegExp;

var VOID_ELEMENTS = [
  'area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input',
  'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'
];

module.exports = function (input) {

  if (typeof input !== 'string') {
    throw 'first argument needs to be an HTML string';
  }

  // Escape potential ol triggers
  input = input.replace(/(\d+)\. /g, '$1\\. ');

  var clone = _document.createElement('div');
  clone.innerHTML = input;
  removeBlankNodes(clone);

  // Flattens node tree into a single array
  var nodes = bfsOrder(clone);

  // Loop through nodes in reverse (so deepest child elements are first).
  // Replace nodes as necessary.
  for (var i = nodes.length - 1; i >= 0; i--) {
    var node = nodes[i];
    var replacement = replacementForNode(node);
    if (replacement) { node.parentNode.replaceChild(replacement, node); }
  }

  var output = he.decode(clone.innerHTML);

  return output.replace(/^[\t\r\n]+|[\t\r\n\s]+$/g, '')
               .replace(/\n\s+\n/g, '\n\n')
               .replace(/\n{3,}/g, '\n\n');
};

function bfsOrder(root) {
  var inqueue = [root];
  var outqueue = [];
  while (inqueue.length > 0) {
    var elem = inqueue.shift();
    outqueue.push(elem);
    var children = elem.childNodes;
    for (var i = 0 ; i < children.length; i++) {
      if (children[i].nodeType === 1) {
        inqueue.push(children[i]);
      }
    }
  }
  outqueue.shift();
  return outqueue;
}

function canConvertNode(node, filter) {
  if (isRegExp(filter)) {
    return filter.test(node.tagName);
  }
  else if (typeof filter === 'string') {
    return new RegExp('^' + filter + '$', 'i').test(node.tagName);
  }
  else if (typeof filter === 'function') {
    return filter(node);
  }
  else {
    throw '`filter` needs to be a RegExp, string, or function';
  }
}

// Loops through all md converters, checking to see if the node tagName matches.
// Returns the replacement text node or null.
function replacementForNode(node) {

  // Remove blank nodes
  if (VOID_ELEMENTS.indexOf(node.tagName.toLowerCase()) === -1 && /^\s*$/i.test(node.innerHTML)) {
    return _document.createTextNode('');
  }

  for (var i = 0; i < converters.length; i++) {
    var converter = converters[i];

    if (canConvertNode(node, converter.filter)) {
      var replacement = converter.replacement;
      var text;

      if (typeof replacement !== 'function') {
        throw '`replacement` needs to be a function that returns a string';
      }

      text = replacement(he.decode(node.innerHTML), node);

      return _document.createTextNode(text);
    }
  }
  return null;
}

function removeBlankNodes(node) {
  var child, next;
  switch (node.nodeType) {
    case 3: // Text node
      if (node.parentNode.tagName !== 'PRE' && node.parentNode.tagName !== 'CODE') {
        var value = node.nodeValue;
        if (/\S/.test(value)) {
          node.nodeValue = value.replace(/^[\n\r\t\f]+[\s]*|\s+$/gm, '');
        }
        else {
          node.parentNode.removeChild(node);
        }
      }
      break;
    case 8: // Comment node
      node.parentNode.removeChild(node);
      break;
    case 1: // Element node
    case 9: // Document node
      child = node.firstChild;
      while (child) {
        next = child.nextSibling;
        removeBlankNodes(child);
        child = next;
      }
      break;
  }
}