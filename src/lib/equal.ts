"use strict";

const isEqualNativeTypes = function isEqualNativeTypes(test1: any, test2: any) {
  return test1.toString() === test2.toString();
};
var isEqualArrays = function isEqualArrays(test1: any, test2: any) {
  var len = test1.length;
  if (len !== test2.length) {
    return false;
  }
  for (var i = 0; i < len; i++) {
    if (!isEqual(test1[i], test2[i])) {
      return false;
    }
  }
  return true;
};
const isEqualObjects = function isEqualObjects(test1: any, test2: any) {
  var keys = Object.keys(test1);
  var len = keys.length;
  if (len !== Object.keys(test2).length) {
    return false;
  }
  for (var i = 0; i < len; i++) {
    var key = keys[i];
    if (
      !(
        Object.prototype.hasOwnProperty.call(test2, key as any) &&
        isEqual(test1[key as any], test2[key as any])
      )
    ) {
      return false;
    }
  }
  return true;
};

export const isEqual = function isEqual(test1: unknown, test2: unknown) {
  if (test1 === test2) {
    return true;
  }
  if (
    typeof test1 !== typeof test2 ||
    test1 !== Object(test1) ||
    !test1 ||
    !test2
  ) {
    return false;
  }
  if (Array.isArray(test1) && Array.isArray(test2)) {
    return isEqualArrays(test1, test2);
  }
  var test1ToString = Object.prototype.toString.call(test1);
  if (
    test1ToString === "[object Object]" &&
    Object.prototype.toString.call(test2) === test1ToString
  ) {
    return isEqualObjects(test1, test2);
  }
  if (typeof test1 === "function") {
    return test1 === test2;
  }
  return isEqualNativeTypes(test1, test2);
};
