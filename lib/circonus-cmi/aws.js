/*
 * Copyright (c) 2014, Circonus, Inc.
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
    if(n.AvailabilityZone) tags.push("ec2-availability_zone:" + n.AvailabilityZone);
    if(n.InstanceId) tags.push("ec2-instance_id:" + n.InstanceId);
    if(n.InstanceType) tags.push("ec2-instance_type:" + n.InstanceType);
    return tags;
};
var non_ec2_tags = function(a) {
    if(!/:/.test(a)) return false;
    return !/^ec2-/.test(a);
};
list.prototype.doregion = function(r) {
    var self = this;
    return (function (region, AWSs) {
        var scan = function(cb) {
            AWSs.config.credentials = self.aws_creds;
            AWSs.config.region = region;
            var params = {};
            (new AWSs.EC2()).describeInstances(params, function(err, data) {
                if (err) {
                    cb(err, false);
                    return;
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
                        if(inst.Tags) {
                          inst.Tags.map(function(tobj) {
                            if(tobj.Key !== null && tobj.Value !== null) {
                              o.tags.push('ec2-tag-' + tobj.Key.toLowerCase() + ':' + tobj.Value.toLowerCase());
                            }
                          });
                        }
                        if(inst.PublicIpAddress !== undefined)
                            self.ips[inst.PublicIpAddress] = o;
                        if(inst.PrivateIpAddress !== undefined)
                            self.ips[inst.PrivateIpAddress] = o;
                        self.instances[o.InstanceId] = o;
                    });
                });
                if(data.NextToken) {
                  params.NextToken = data.NextToken;
                  scan(cb);
                  return;
                }
                cb(null, true);
            });
        };
        return scan;
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
