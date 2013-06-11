var cmiUtil = require('../../cmiUtil');

function ChefNode (data){
    this.data = data || {};
    this.name = this.data.name;
    this.enviornment = this.data.chef_enviornment;
    this.jsonClass = this.data.json_class;
    this.chefType = this.data.chef_type;
    this.runList = this.data.run_list;
    this.ips = this._ips();
    this.attributes = this._mergeAttributes();
    this.circonusAttributes = this.attributes.circonus;
    this._substituteCirconus();
}

ChefNode.prototype._mergeAttributes = function(){
    var attributes = {};

    // Attribute precedence:
    // http://docs.opscode.com/essentials_cookbook_attribute_files.html
    // Note: Chef's API has already distilled the attributes down to
    //       the node level. We only need to merge attribute types.

    cmiUtil.mergeDeep(attributes, this.data.default);
    cmiUtil.mergeDeep(attributes, this.data.force_default);
    cmiUtil.mergeDeep(attributes, this.data.normal);
    cmiUtil.mergeDeep(attributes, this.data.override);
    cmiUtil.mergeDeep(attributes, this.data.force_override);
    cmiUtil.mergeDeep(attributes, this.data.automatic);

    return this.attributes = attributes;
};

ChefNode.prototype._ips = function(){
    var _ = {};
    var interfaces = ((this.data.automatic || _).network || _).interfaces;
    if(!interfaces) return [];

    var ips = [];
    for(var iface in interfaces){
        var addresses = interfaces[iface].addresses;
        for(var ip in addresses){
            var family = addresses[ip].family;
            if(family !== 'inet' && family !== 'inet6') continue;
            if(/^(?:127\.0\.0\.\d+|::1?)$/.test(ip)) continue;
            ips.push(ip);
        }
    }

    return this.ips = ips;
};

ChefNode.prototype._substituteCirconus = function(){
    var attributes = this.attributes;
    var circonusAttributes = JSON.stringify(this.circonusAttributes || {});
    var mainRegex = /#{node(\[:[^\]]+\])+}/g;
    var propRegex = /\[:[^\]]+(?=\])/g;

    var substitutions = circonusAttributes.match(mainRegex) || [];
    // Sort longest to shortest. This will effectively prioritize more specific
    // to less specific in a given property path so we don't accidentally sub
    // node[:foo] before node[:foo][:bar] and end up with baz[:bar]
    substitutions.sort(function(a,b){
        return a.length < b.length;
    });
    for(var i = 0, sLen = substitutions.length; i < sLen; i++){
        var placeholder = substitutions[i];
        var value = placeholder
            .match(propRegex)
            .map(function(element){
                return element && element.slice(2);
            })
            .reduce(function(prevVal, curVal){
                if(typeof prevVal === 'undefined' || prevVal === null){
                    console.error('Reference property',curVal,'of',
                        prevVal,'in',placeholder,'for',circonusAttributes);
                    return undefined;
                }
                return prevVal[curVal];
            }, attributes);
        if(typeof value === 'undefined' || value === null) value = '';
        if(typeof value !== 'string') value = JSON.stringify(value);
        circonusAttributes = circonusAttributes.replace(placeholder, value);
    }
    return this.circonusAttributes = JSON.parse(circonusAttributes);
};

module.exports = ChefNode;
