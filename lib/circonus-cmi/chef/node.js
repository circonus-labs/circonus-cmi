function ChefNode (data){
    this.data = data || {};
    this.name = this.data.name;
    this.enviornment = this.data.chef_enviornment;
    this.jsonClass = this.data.json_class;
    this.chefType = this.data.chef_type;
    this.runList = this.data.run_list;
    this.ips = this._ips();
    this.attributes = this._mergeAttributes();
    this.circonusAttributes = mergeDeep(this.data.circonus, this.attributes.circonus);
}

ChefNode.prototype._mergeAttributes = function(){
    var attributes = {};

    // Attribute precedence:
    // http://docs.opscode.com/essentials_cookbook_attribute_files.html
    // Note: Chef's API has already distilled the attributes down to
    //       the node level. We only need to merge attribute types.

    mergeDeep(attributes, this.data.default);
    mergeDeep(attributes, this.data.force_default);
    mergeDeep(attributes, this.data.normal);
    mergeDeep(attributes, this.data.override);
    mergeDeep(attributes, this.data.force_override);
    mergeDeep(attributes, this.data.automatic);

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

function mergeDeep(obj1, obj2){
    if(!obj1) obj1 = {};
    for(var prop in obj2){
        var val = obj2[prop];
        var orig = obj1[prop];
        if(val !== null && typeof val !== 'undefined'
          && val.constructor === Object){
            obj1[prop] = mergeDeep(obj1[prop] || {}, val);
        } else if(orig instanceof Array && val instanceof Array) {
            obj1[prop] = orig.concat(val);
        } else {
            obj1[prop] = val;
        }
    }

    return obj1;
}

module.exports = ChefNode;
