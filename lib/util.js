var crypto = require('crypto');

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
