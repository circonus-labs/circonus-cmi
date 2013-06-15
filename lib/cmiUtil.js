/*
 * Copyright (c) 2013, Circonus, Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 *       copyright notice, this list of conditions and the following
 *       disclaimer in the documentation and/or other materials provided
 *       with the distribution.
 *     * Neither the name Circonus, Inc. nor the names of its contributors
 *       may be used to endorse or promote products derived from this
 *       software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

function unionArray(arr1, arr2){
    var uniq = {};
    var union = [];
    for(var i = 0, arr1Len = arr1.length; i < arr1Len; i++){
        var value = arr1[i];
        var json = JSON.stringify(value);
        if(uniq[json]) continue;
        uniq[json] = true;
        union.push(value);
    }
    for(var j = 0, arr2Len = arr2.length; j < arr2Len; j++){
        var value = arr2[j];
        var json = JSON.stringify(value);
        if(uniq[json]) continue;
        uniq[json] = true;
        union.push(value);
    }
    return union;
}

function mergeDeep(obj1, obj2){
    if(!obj1) obj1 = {};
    for(var prop in obj2){
        if(!obj2.hasOwnProperty(prop)) continue;
        var val = obj2[prop];
        var orig = obj1[prop];
        if(val === null || typeof val === 'undefined'){
            continue;
        } else if(val.constructor === Object){
            obj1[prop] = mergeDeep(orig || {}, val);
        } else if(orig instanceof Array && val instanceof Array) {
            obj1[prop] = unionArray(orig,val);
        } else {
            obj1[prop] = val;
        }
    }

    return obj1;
}

module.exports = {
    unionArray: unionArray,
    mergeDeep: mergeDeep
};
