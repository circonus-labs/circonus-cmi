var async = require('async'),
    util = require('util'),
    events = require('events');

var list = function(options) {
    this.options = options;
    this.AWS = require('aws-sdk');
    this.aws_creds = new this.AWS.Credentials(
        options.accessKeyId,
        options.secretAccessKey,
        options.sessionToken
    );
    this.AWS.config.credentials = this.aws_creds;
    this.AWS.config.region = options.region || 'us-east-1';
    this.ips = {};
    this.instances = {};
};

util.inherits(list, events.EventEmitter);

list.prototype.mktags = function(n) {
    var tags = [];
    if(n.Region) tags.push("ec2-region:" + n.Region);
    if(n.AvailabilityZone) tags.push("ec2-zone:" + n.AvailabilityZone);
    if(n.InstanceId) tags.push("ec2-id:" + n.InstanceId);
    if(n.InstanceType) tags.push("ec2-type:" + n.InstanceType);
    return tags;
};
var non_ec2_tags = function(a) {
    if(!/:/.test(a)) return false;
    return !/^ec2-/.test(a);
};
list.prototype.doregion = function(r) {
    var self = this;
    return (function (region, AWSs) {
        return function(cb) {
            AWSs.config.credentials = self.aws_creds;
            AWSs.config.region = region;

            (new AWSs.EC2()).describeInstances({}, function(err, data) {
                if (err) {
                    console.log("HERE", err);
                    return cb(null, false);
                }
                data.Reservations.forEach(function(a) {
                    a.Instances.forEach(function (inst) {
                        var o = {
                            AvailabilityZone: inst.Placement.AvailabilityZone,
                            InstanceId: inst.InstanceId,
                            InstanceType: inst.InstanceType,
                            Region: region,
                            State: inst.State.Name
                        };
                        o.tags = self.mktags(o);
                        if(inst.PublicIpAddress !== undefined)
                            self.ips[inst.PublicIpAddress] = o;
                        if(inst.PrivateIpAddress !== undefined)
                            self.ips[inst.PrivateIpAddress] = o;
                        self.instances[o.InstanceId] = o;
                    });
                });
                cb(null, true);
            });
        };
    })(r, require('aws-sdk'));
};

list.prototype.find_nodes = function() {
    var self = this;
    (new self.AWS.EC2()).describeRegions({}, function(err, data) {
        var allregions = {};
        if(err) return self.emit('error', err);
        data.Regions.forEach( function (key) {
            allregions[key.RegionName] = self.doregion(key.RegionName);
        });
        async.parallel(allregions, function(err2, data2) {
            self.emit('nodes', self.ips, self.instances);
        });
    });
};

module.exports = list;
