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
    userDefined = require('../userDefined'),
    extend = util._extend,
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
    this.namespace = {};
    this.region_hash = {};
    this.autoscaling_hash = {};
    this.regions = new Array();
    this.user_defined = new userDefined();
};

util.inherits(list, events.EventEmitter);

list.prototype.list_cloudwatch_metrics = function(params, cb) {
    var self = this;
    var AWSs = params.AWSs;
    var region = params.region;
    var key = params.key;
    var dim = params.dim;
    var namespace = params.namespace;
    var query = params.Query;
    (new AWSs.CloudWatch({'region': region})).listMetrics(query, function(err, data) {
        if (err) {
            cb(err);
            return;
        }
        if (data.Metrics.length == 0) {
            delete self.region_hash[region][namespace][dim][key];
        }
        else {
            var metrics_array = [];
            for (var i = 0; i < data.Metrics.length; i++) {
                var entry = data.Metrics[i];
                if ((entry.Dimensions.length == 1) &&
                    (entry.Dimensions[0].Name === dim)) {
                    metrics_array.push(entry);
                }
            }
            self.region_hash[region][namespace][dim][key].metrics = metrics_array;
        }
        cb(null);
    });
};
list.prototype.make_list_metric_param = function(AWSs, region, key, dim, ns_short, ns_full) {
    var self = this;
    var toReturn = {
        'AWSs': AWSs,
        'region': region,
        'key': key,
        'dim': dim,
        'namespace': ns_short,
        'Query': {
            'Dimensions': [
                {
                    'Name': dim,
                    'Value': key
                }
            ],
            'Namespace': ns_full
        }
    };
    return toReturn;
};
list.prototype.mk_ec2_tags = function(n, dimension, add_id_tag) {
    var self = this;
    var tags = [];
    if(n.Region) tags.push("aws-ec2-region:" + n.Region);
    if(n.AvailabilityZone) tags.push("aws-ec2-availability_zone:" + n.AvailabilityZone);
    if ((dimension === 'InstanceId') || (dimension === 'All')){
        if(n.InstanceId) tags.push("aws-ec2-instance_id:" + n.InstanceId);
        if(n.InstanceType) tags.push("aws-ec2-instance_type:" + n.InstanceType);
        if(n.ImageId) tags.push("aws-ec2-image_id:" + n.ImageId);
        if(n.AutoScalingGroupName) tags.push("aws-ec2-auto_scaling_group_name:" + n.AutoScalingGroupName);
    }
    else if (dimension === 'InstanceType') {
        if(n.InstanceType) tags.push("aws-ec2-instance_type:" + n.InstanceType);
    }
    else if (dimension === 'ImageId') {
        if(n.ImageId) tags.push("aws-ec2-image_id:" + n.ImageId);
    }
    else if (dimension === 'AutoScalingGroupName') {
        if(n.AutoScalingGroupName) tags.push("aws-ec2-auto_scaling_group_name:" + n.AutoScalingGroupName);
    }
    if ((add_id_tag) && (self.options.id)) {
        tags.push("aws-id:" + self.options.id);
    }
    return tags;
};
list.prototype.mk_ebs_tags = function(n, dimension) {
    var self = this;
    var tags = [];
    if(n.VolumeId) tags.push("aws-ebs-volume_id:" + n.VolumeId);
    if(n.SnapshotId) tags.push("aws-ebs-snapshot_id:" + n.SnapshotId);
    if(n.AvailabilityZone) tags.push("aws-ebs-availability_zone:" + n.AvailabilityZone);
    if(n.VolumeType) tags.push("aws-ebs-volume_type:" + n.VolumeType);
    if (self.options.id) {
        tags.push("aws-id:" + self.options.id);
    }
    return tags;
}
list.prototype.mk_elb_tags = function(n, dimension) {
    var self = this;
    var tags = [];
    if(n.LoadBalancerName) tags.push("aws-elb-load_balancer_name:" + n.LoadBalancerName);
    if(n.AvailabilityZone) tags.push("aws-elb-availability_zone:" + n.AvailabilityZone);
    if (self.options.id) {
        tags.push("aws-id:" + self.options.id);
    }
    return tags;
}
list.prototype.mk_rds_tags = function(n, dimension) {
    var self = this;
    var tags = [];
    if ((dimension === 'EngineName') || (dimension === 'DBInstanceIdentifier')){
        if(n.EngineName) tags.push("aws-rds-engine_name:" + n.EngineName);
    }
    if ((dimension === 'DatabaseClass') || (dimension === 'DBInstanceIdentifier')){
        if(n.DatabaseClass) tags.push("aws-rds-database_class:" + n.DatabaseClass);
    }
    if (dimension === 'DBInstanceIdentifier') {
        if(n.DBInstanceIdentifier) tags.push("aws-rds-db_instance_identifier:" + n.DBInstanceIdentifier);
        if(n.MasterUsername) tags.push("aws-rds-master_username:" + n.MasterUsername);
        if(n.DBName) tags.push("aws-rds-db_name:" + n.DBName);
    }
    if (self.options.id) {
        tags.push("aws-id:" + self.options.id);
    }
    return tags;
}
list.prototype.mk_autoscaling_tags = function(n, dimension) {
    var self = this;
    var tags = [];
    if (n.AutoScalingGroupName) tags.push("aws-autoscaling-auto_scaling_group_name:" + n.AutoScalingGroupName);
    if (self.options.id) {
        tags.push("aws-id:" + self.options.id);
    }
    return tags;
}
var non_aws_tags = function(a) {
    if(!/:/.test(a)) return false;
    return !/^(?:ec2|aws)-/.test(a);
};
list.prototype.translate_tags = function(aws_tags, circonus_tags, prefix, namespace) {
    var self=this;
    if (self.options.tag_translation_function) {
        eval("self.user_defined." + self.options.tag_translation_function + "(aws_tags, circonus_tags, prefix, namespace);");
    }
    else {
        if (aws_tags) {
            aws_tags.map(function(tobj) {
                if(tobj.Key !== null && tobj.Value !== null) {
                    var new_name = prefix + "-" + tobj.Key.toLowerCase();
                    new_name = new_name.replace(/:/g, "`");
                    circonus_tags.push(new_name + ':' + tobj.Value.toLowerCase());
                }
            });
        }
    }
};
list.prototype.get_autoscaling_name = function(region, instance_id) {
    var self = this;
    var toReturn = null;
    if (self.autoscaling_hash[region]) {
        if (self.autoscaling_hash[region][instance_id]) {
            toReturn = self.autoscaling_hash[region][instance_id];
        }
    }
    return toReturn;
};
list.prototype.do_ec2_region = function(r) {
    var self = this;
    return (function (region, AWSs) {
        var params = {};
        var scan = function(cb) {
            AWSs.config.credentials = self.aws_creds;
            AWSs.config.region = region;
            var process_array = [];
            var all = false;
            if (self.options.ec2) {
                process_array = self.options.ec2;
                all = (self.options.ec2.indexOf("all") !== -1);
            }
            (new AWSs.EC2({'region': region})).describeInstances(params, function(err, data) {
                if (err) {
                    cb(err, false);
                    return;
                }
                self.region_hash[region].ec2 = {};
                data.Reservations.forEach(function(a) {
                    a.Instances.forEach(function (inst) {
                        var o = {
                            AvailabilityZone: inst.Placement.AvailabilityZone,
                            InstanceId: inst.InstanceId,
                            InstanceType: inst.InstanceType,
                            ImageId: inst.ImageId,
                            Region: region,
                            State: inst.State.Name
                        };
                        var AutoScalingGroupName = self.get_autoscaling_name(region, inst.InstanceId);
                        if (AutoScalingGroupName) {
                            o.AutoScalingGroupName = AutoScalingGroupName;
                        }
                        var inst_tags = [];
                        self.translate_tags(inst.Tags, inst_tags, self.options.aws_tag_prefix, "ec2");
                        o.tags = self.mk_ec2_tags(o, "InstanceId", false);
                        if(inst.PublicIpAddress !== undefined)
                            self.ips[inst.PublicIpAddress] = o;
                        if(inst.PrivateIpAddress !== undefined)
                            self.ips[inst.PrivateIpAddress] = o;
                        self.instances[o.InstanceId] = o;
                        if ((o.InstanceId) && ((all === true) || (process_array.indexOf("InstanceId") !== -1))) {
                            var item = extend({}, o);
                            delete(item.tags);
                            item.tags = self.mk_ec2_tags(item, "InstanceId", true);
                            for (var idx in inst_tags) {
                                item.tags.push(inst_tags[idx]);
                            }
                            item.tags.sort();
                            if (!self.region_hash[region].ec2.InstanceId) {
                                self.region_hash[region].ec2.InstanceId = {};
                            }
                            self.region_hash[region].ec2.InstanceId[o.InstanceId] = item;
                        }
                        if ((o.ImageId) && ((all === true) || (process_array.indexOf("ImageId") !== -1))){
                            var item = extend({}, o);
                            delete(item.tags);
                            item.tags = self.mk_ec2_tags(item, "ImageId", true);
                            item.tags.sort();
                            if (!self.region_hash[region].ec2.ImageId) {
                                self.region_hash[region].ec2.ImageId = {};
                            }
                            self.region_hash[region].ec2.ImageId[o.ImageId] = item;
                        }
                        if ((o.InstanceType) && ((all === true) || (process_array.indexOf("InstanceType") !== -1))){
                            var item = extend({}, o);
                            delete(item.tags);
                            item.tags = self.mk_ec2_tags(item, "InstanceType", true);
                            item.tags.sort();
                            if (!self.region_hash[region].ec2.InstanceType) {
                                self.region_hash[region].ec2.InstanceType = {};
                            }
                            self.region_hash[region].ec2.InstanceType[o.InstanceType] = item;
                        }
                        if ((o.AutoScalingGroupName) && ((all === true) || (process_array.indexOf("AutoScalingGroupName") !== -1))){
                            var item = extend({}, o);
                            delete(item.tags);
                            item.tags = self.mk_ec2_tags(item, "AutoScalingGroupName", true);
                            item.tags.sort();
                            if (!self.region_hash[region].ec2.AutoScalingGroupName) {
                                self.region_hash[region].ec2.AutoScalingGroupName = {};
                            }
                            self.region_hash[region].ec2.AutoScalingGroupName[o.AutoScalingGroupName] = item;
                        }
                    });
                });
                if(data.NextToken) {
                  params.NextToken = data.NextToken;
                  scan(cb);
                  return;
                }
                var list_params = [];
                for (var dim in self.region_hash[region].ec2) {
                    var keys = Object.keys(self.region_hash[region].ec2[dim]);
                    keys.forEach(function (key) {
                        list_params.push(self.make_list_metric_param(AWSs, region, key, dim, "ec2", "AWS/EC2"));
                    });
                }
                async.eachSeries(list_params, self.list_cloudwatch_metrics.bind(self), function(err) {
                    if (err) {
                        console.log("ERROR: " + err);
                    }
                    cb(null, true);
                });
            });
        };
        return scan;
    })(r, require('aws-sdk'));
};
list.prototype.do_ebs_region = function(r) {
    var self = this;
    return (function (region, AWSs) {
        var params = {};
        var scan = function(cb) {
            AWSs.config.credentials = self.aws_creds;
            AWSs.config.region = region;
            var process_array = self.options.ebs;
            var all = (self.options.ebs.indexOf("all") !== -1);
            (new AWSs.EC2({'region': region})).describeVolumes(params, function(err, data) {
                if (err) {
                    cb(err, false);
                    return;
                }
                self.region_hash[region].ebs = {};
                data.Volumes.forEach(function(a) {
                    var o = {
                        AvailabilityZone: a.AvailabilityZone,
                        VolumeId: a.VolumeId,
                        SnapshotId: a.SnapshotId,
                        VolumeType: a.VolumeType            
                    }
                    var inst_tags = [];
                    self.translate_tags(a.Tags, inst_tags, self.options.aws_tag_prefix, "ebs");
                    if ((o.VolumeId) && ((all === true) || (process_array.indexOf("VolumeId") !== -1))) {
                        var item = extend({}, o);
                        item.tags = self.mk_ebs_tags(item);
                        for (var idx in inst_tags) {
                            item.tags.push(inst_tags[idx]);
                        }
                        item.tags.sort();
                        if (!self.region_hash[region].ebs.VolumeId) {
                            self.region_hash[region].ebs.VolumeId = {};
                        }
                        self.region_hash[region].ebs.VolumeId[item.VolumeId] = item;
                    }
                });
                if(data.NextToken) {
                  params.NextToken = data.NextToken;
                  scan(cb);
                  return;
                }
                var list_params = [];
                for (var dim in self.region_hash[region].ebs) {
                    var keys = Object.keys(self.region_hash[region].ebs[dim]);
                    keys.forEach(function (key) {
                        list_params.push(self.make_list_metric_param(AWSs, region, key, dim, "ebs", "AWS/EBS"));
                    });
                }
                async.eachSeries(list_params, self.list_cloudwatch_metrics.bind(self), function(err) {
                    if (err) {
                        console.log("ERROR: " + err);
                    }
                    cb(null, true);
                });
            });
        };
        return scan;
    })(r, require('aws-sdk'));
};
list.prototype.do_elb_region = function(r) {
    var self = this;
    return (function (region, AWSs) {
        var params = {};
        var scan = function(cb) {
            AWSs.config.credentials = self.aws_creds;
            AWSs.config.region = region;
            var process_array = self.options.elb;
            var all = (self.options.elb.indexOf("all") !== -1);
            (new AWSs.ELB({'region': region})).describeLoadBalancers(params, function(err, data) {
                if (err) {
                    cb(err, false);
                    return;
                }
                self.region_hash[region].elb = {};
                data.LoadBalancerDescriptions.forEach(function(a) {
                    var items = [];
                    var o = {
                        LoadBalancerName: a.LoadBalancerName
                    }
                    var inst_tags = [];
                    self.translate_tags(a.Tags, inst_tags, self.options.aws_tag_prefix, "elb");
                    items.push(o);
                    for (var i=0; i < a.AvailabilityZones.length; i++) {
                        var o2 = {
                            AvailabilityZone: a.AvailabilityZones[i]
                        }
                        items.push(o2);
                    }
                    for (var i=0; i < items.length; i++)
                    {
                        var o = items[i];
                        if ((o.LoadBalancerName) && ((all === true) || (process_array.indexOf("LoadBalancerName") !== -1))){
                            var item = extend({}, o);
                            item.tags = self.mk_elb_tags(item, "LoadBalancerName");
                            for (var idx in inst_tags) {
                                item.tags.push(inst_tags[idx]);
                            }
                            item.tags.sort();
                            if (!self.region_hash[region].elb.LoadBalancerName) {
                                self.region_hash[region].elb.LoadBalancerName = {};
                            }
                            self.region_hash[region].elb.LoadBalancerName[o.LoadBalancerName] = item;
                        }
                        if ((o.AvailabilityZone) && ((all === true) || (process_array.indexOf("AvailabilityZone") !== -1))){
                            var item = extend({}, o);
                            item.tags = self.mk_elb_tags(item, "AvailabilityZone");
                            item.tags.sort();
                            if (!self.region_hash[region].elb.AvailabilityZone) {
                                self.region_hash[region].elb.AvailabilityZone = {};
                            }
                            self.region_hash[region].elb.AvailabilityZone[o.AvailabilityZone] = item;
                        }
                    }
                });
                if(data.NextToken) {
                  params.NextToken = data.NextToken;
                  scan(cb);
                  return;
                }
                var list_params = [];
                for (var dim in self.region_hash[region].elb) {
                    var keys = Object.keys(self.region_hash[region].elb[dim]);
                    keys.forEach(function (key) {
                        list_params.push(self.make_list_metric_param(AWSs, region, key, dim, "elb", "AWS/ELB"));
                    });
                }
                async.eachSeries(list_params, self.list_cloudwatch_metrics.bind(self), function(err) {
                    if (err) {
                        console.log("ERROR: " + err);
                    }
                    cb(null, true);
                });
            });
        };
        return scan;
    })(r, require('aws-sdk'));
};
list.prototype.do_rds_region = function(r) {
    var self = this;
    return (function (region, AWSs) {
        var params = {};
        var scan = function(cb) {
            AWSs.config.credentials = self.aws_creds;
            AWSs.config.region = region;
            var process_array = self.options.rds;
            var all = (self.options.rds.indexOf("all") !== -1);
            (new AWSs.RDS({'region': region})).describeDBInstances(params, function(err, data) {
                if (err) {
                    cb(err, false);
                    return;
                }
                self.region_hash[region].rds = {};
                data.DBInstances.forEach(function(a) {
                    var o = {
                        DBInstanceIdentifier: a.DBInstanceIdentifier,
                        AvailabilityZone: a.AvailabilityZone,
                        DatabaseClass: a.DBInstanceClass,
                        EngineName: a.Engine,
                        MasterUsername: a.MasterUsername,
                        DBName: a.DBName
                    }
                    if ((o.DBInstanceIdentifier) && ((all === true) || (process_array.indexOf("DBInstanceIdentifier") !== -1))){
                        var item = extend({}, o);
                        item.tags = self.mk_rds_tags(item, "DBInstanceIdentifier");
                        item.tags.sort();
                        if (!self.region_hash[region].rds.DBInstanceIdentifier) {
                            self.region_hash[region].rds.DBInstanceIdentifier = {};
                        }
                        self.region_hash[region].rds.DBInstanceIdentifier[o.DBInstanceIdentifier] = item;
                    }
                    if ((o.EngineName) && ((all === true) || (process_array.indexOf("EngineName") !== -1))){
                        var item = extend({}, o);
                        item.tags = self.mk_rds_tags(item, "EngineName");
                        item.tags.sort();
                        if (!self.region_hash[region].rds.EngineName) {
                            self.region_hash[region].rds.EngineName = {};
                        }
                        self.region_hash[region].rds.EngineName[o.EngineName] = item;
                    }
                    if ((o.DatabaseClass) && ((all === true) || (process_array.indexOf("DatabaseClass") !== -1))){
                        var item = extend({}, o);
                        item.tags = self.mk_rds_tags(item, "DatabaseClass");
                        item.tags.sort();
                        if (!self.region_hash[region].rds.DatabaseClass) {
                            self.region_hash[region].rds.DatabaseClass = {};
                        }
                        self.region_hash[region].rds.DatabaseClass[o.DatabaseClass] = item;
                    }
                });
                if(data.NextToken) {
                  params.NextToken = data.NextToken;
                  scan(cb);
                  return;
                }
                var list_params = [];
                for (var dim in self.region_hash[region].rds) {
                    var keys = Object.keys(self.region_hash[region].rds[dim]);
                    keys.forEach(function (key) {
                        list_params.push(self.make_list_metric_param(AWSs, region, key, dim, "rds", "AWS/RDS"));
                    });
                }
                async.eachSeries(list_params, self.list_cloudwatch_metrics.bind(self), function(err) {
                    if (err) {
                        console.log("ERROR: " + err);
                    }
                    cb(null, true);
                });
            });
        };
        return scan;
    })(r, require('aws-sdk'));
};
list.prototype.do_autoscaling_region = function(r) {
    var self = this;
    return (function (region, AWSs) {
        var params = {};
        var scan = function(cb) {
            AWSs.config.credentials = self.aws_creds;
            AWSs.config.region = region;
            var process_array = [];
            var all = false;
            if (self.options.autoscaling) {
                process_array = self.options.autoscaling;
                all = (self.options.autoscaling.indexOf("all") !== -1);
            }
            (new AWSs.AutoScaling({'region': region})).describeAutoScalingGroups(params, function(err, data) {
                if (err) {
                    cb(err, false);
                    return;
                }
                self.region_hash[region].autoscaling = {};
                data.AutoScalingGroups.forEach(function(a) {
                    var o = {
                        AutoScalingGroupName: a.AutoScalingGroupName,
                        Instances: a.Instances
                    }
                    for (var i=0; i < a.Instances.length; i++) {
                        var instance = a.Instances[i].InstanceId;
                        if (instance) {
                            if (!self.autoscaling_hash[region]) {
                                self.autoscaling_hash[region] = {};
                            }
                            if (!self.autoscaling_hash[region][instance]) {
                                self.autoscaling_hash[region][instance] = a.AutoScalingGroupName;
                            }
                        }
                    }
                    var inst_tags = [];
                    self.translate_tags(a.Tags, inst_tags, self.options.aws_tag_prefix, "autoscaling");
                    if ((o.AutoScalingGroupName) && ((all === true) || (process_array.indexOf("AutoScalingGroupName") !== -1))) {
                        var item = extend({}, o);
                        item.tags = self.mk_autoscaling_tags(item);
                        for (var idx in inst_tags) {
                            item.tags.push(inst_tags[idx]);
                        }
                        item.tags.sort();
                        if (!self.region_hash[region].autoscaling.AutoScalingGroupName) {
                            self.region_hash[region].autoscaling.AutoScalingGroupName = {};
                        }
                        self.region_hash[region].autoscaling.AutoScalingGroupName[item.AutoScalingGroupName] = item;
                    }
                });
                if(data.NextToken) {
                  params.NextToken = data.NextToken;
                  scan(cb);
                  return;
                }
                var list_params = [];
                for (var dim in self.region_hash[region].autoscaling) {
                    var keys = Object.keys(self.region_hash[region].autoscaling[dim]);
                    keys.forEach(function (key) {
                        list_params.push(self.make_list_metric_param(AWSs, region, key, dim, "autoscaling", "AWS/AutoScaling"));
                    });
                }
                async.eachSeries(list_params, self.list_cloudwatch_metrics.bind(self), function(err) {
                    if (err) {
                        console.log("ERROR: " + err);
                    }
                    cb(null, true);
                });
            });
        };
        return scan;
    })(r, require('aws-sdk'));
};

list.prototype.get_regions = function() {
    var self = this;
    (new self.AWS.EC2()).describeRegions({}, function(err, data) {
        if(err) return self.emit('error', err);
        data.Regions.forEach( function (key) {
            self.regions.push(key);
            self.region_hash[key.RegionName] = {};
        });
        self.emit('regions', self.regions);
    });
}

list.prototype.process = function(name) {
    var self = this;
    var allregions = {};
    self.regions.forEach( function (key) {
        if (name === 'ec2') {
            allregions[key.RegionName] = self.do_ec2_region(key.RegionName);
        }
        else if (name === 'ebs') {
            allregions[key.RegionName] = self.do_ebs_region(key.RegionName);
        }
        else if (name === 'elb') {
            allregions[key.RegionName] = self.do_elb_region(key.RegionName);
        }
        else if (name === 'rds') {
            allregions[key.RegionName] = self.do_rds_region(key.RegionName);
        }
        else if (name === 'autoscaling') {
            allregions[key.RegionName] = self.do_autoscaling_region(key.RegionName);
        }
    });
    async.parallel(allregions, function(err2, data2) {
        if (name === 'ec2') {
            self.emit(name, self.ips, self.instances, self.region_hash);
        }
        else {
            self.emit(name, self.region_hash);
        }
    });
};

module.exports = list;
