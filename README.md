# circonus-cmi

## Overview

circonus-cmi is a command line tool written in [Node.JS](http://nodejs.org/) to control of [Circonus]() checks based on [Chef Server](http://wiki.opscode.com/display/chef/Home) and [AWS](http://aws.amazon.com/). Support for [Puppet](https://puppetlabs.com/) coming soon.

## License

Modified BSD. See LICENSE.

## Requirements

* Node.js >= 0.4

## Usage

	Usage: circonus-cmi [options]

	--help, -h
		Displays help information about this script
		'circonus-cmi -h' or 'circonus-cmi --help'

	--config-file, -f
		config file with AWS and Circonus credentials

	--circonus, -c
		synchronized with circonus via config section <name>

	--ec2, -e
		synchronized with ec2 via config section <name>

	--privatechef, -p
		synchronized with chef via config section <name>

### Example

	./circonus-cmi -f config.json -c circonus -p chef1

## Configuration

There are three main components of the configuration file, one for each Circonus, AWS, and Chef. There can be more than one of each, with the specific config to use specified at run time. For example:

	{
		"aws1": {…},
		"aws2": {…},
		"chef1": {…},
		"chef2": {…},
		"circonus": {…}
	}

For Chef, an API token will need to be [generated here](https://login.circonus.com/user/tokens). The tool will need to be granted access on that same page after the initial run (which will fail) to work properly.

For AWS, an access key ID and secret access key will need to be generated. Go to [http://aws.amazon.com](http://aws.amazon.com), then Account > Security Credentials.

### Circonus

circous-cmi uses the [circonusapi2](https://npmjs.org/package/circonusapi2) module. Full configuration options can be found with in the module documentation. An example config:

	{
		"auth_token": "asdfadsf",
		"app_name": "cmi-tool",
		"cloudwatch": {
			"update_checks": true,
			"automated_check_name_addendum": "Automated",
			"brokers": {
				"default": "My Broker",
				"us-east-1": "My Broker",
				"us-west-1": "My Broker",
				"us-west-2": "My Broker",
				"eu-west-1": "My Broker",
				"eu-central-1": "My Broker",
				"ap-southeast-1": "My Broker",
				"ap-southeast-2": "My Broker",
				"ap-northeast-1": "My Broker",
				"sa-east-1": "My Broker"
			}
		}
	}

### AWS

circonus-cmi uses the [aws-sdk](https://npmjs.org/package/aws-sdk) module. An AWS access key id and secret access key will be needed. Full configuration options can be found with in the module documentation.  An example config:

	{
		"accessKeyId": "asdfasdf",
		"secretAccessKey": "qwerty",
		"region": "us-east-1",
		"id": "circonus-cmi",
		"aws_tag_prefix": "aws-tag",
		"tag_translation_function": "example_translate_tags",
		"granularity": 5,
		"cloudwatch_check_regions": [
			"all"
		],
		"ec2": [
			"InstanceId",
			"ImageId"
		],
		"elb": [
			"VolumeId"
		],
		"ebs": [
			"LoadBalancerName"
		],
		"rds": [
			"all"
		],
		"autoscaling": [
			"all"
		]
	}

### Chef

circonus-cmi uses the [chef-api](https://npmjs.org/package/chef-api) module. Full configuration options can be found with in the module documentation. Example:

	{
		"client_name": "foo",
		"key_path": "foo.pem",
		"url": "https://chef.example.com/organizations/foobar",
		"ca": null
	}

---
## Chef

### Overview

circonus-cmi compiles a list of checks from the Chef source and a list of checks from Circonus. Comparing the lists, the following actions will take place, with Chef as the authority:

* Found in Chef, not in Circonus: Add
* Found in Chef, found in Circonus: Update. The Chef configuration will be deep merged on top of the Circonus configuration. Arrays will be unioned.
* Not found in Chef, found in Circonus: Nothing

#### Correlation of Checks 

All checks managed via Chef are given two specific tags in addition to chef specified ones:

* cmi-id:<nodeName\>-<checkName\>
* cmi-source:<nameOfChefCMIConfig\>

When circonus-cmi compiles the list of existing Circonus checks to examine, it will filter based on the cmi-source tag. Checks specified in Chef will be correlated to checks in Circonus via the cmi-id tag.

### Configuration
Example default_attributes JSON:

	{
		…
		"circonus": {
			"tags": [
				"tagAll1",
				"tagAll2"
			],
			"default_brokers":[
				"/broker/1"
			],
			"checks": {
				"fooCheck":{
					"target": "example.com",
					"brokers": [
						"/broker/1"
					],
					"type": "ping",
					"config": {
					},
					"metrics": [
						{
							"name": "count",
							"type": "numeric"
						}
					],
					"tags": [
						"fooCheckTag"
					] 
				}
			}
		}
	}

#### General

Within a Chef Role or Node, within one of the attribute sections, a "circonus" attribute should be added to contain information about checks and tags. The precedence rules work the same as any other attribute in chef, so things may be overriden. If no brokers are provided for a check, it will use whatever is in default_brokers.

#### Substitution

A Ruby-like syntax is used for specifying dynamic substitutions. It begins with `node` and is of the form:

	"#{node[:foo][:bar]}"

This references the compiled attributes after precedence, property foo, subproperty bar. One common case is to specify the target ip for a check dynamically with:

	"target": "#{node[:ipaddress]}"

#### Tags

Tags can be any string. Each check will have its tags array unioned with the main circonus.tags array. For example, the fooCheck will get three tags, `["tagAll1","tagAll2","fooCheckTag"]`. During updates, the tags specified by Chef will be unioned with the tags currently on the check, not replace them.

#### Checks

Check configuration follows the [Circonus Checkbundle API](https://login.circonus.com/resources/api/calls#check_bundles) specifications. Required properties for all checks:

* target
* brokers (Array. Must include at least one.)
* type
* metrics (Array. Must include at least one. A placeholder metric such as `{"name":foo","type":string"}` is valid.)

An additional "config" object is required by many check types. See the "Check Type Definitions" on the Checkbundle API page for more information..



#### Tag and Metric Removal

Since both tags and metric arrays are union by default, no tags or metrics will get removed. To remove an item from either, add a regex string, prefixed with a bang, to the array. It will be used to match against tags and metric names, respectively. All removals are processed before additions. Example

Circonus: 
	
	"tags": [
		"foo",
		"bar",
		"foobar"
	],
	"metrics": [
		{
			"name": "count",
			"type": "numeric"
		}
	]
	
Chef

	"tags": [
		"!/foo/",
		"foobaz"
	],
	"metrics": [
		"!/count/",
		{
			"name": "maximum",
			"type": "numeric"
		}
	]

Result

	"tags": [
		"bar",
		"foobaz"
	],
	"metrics": [
		{
			"name": "maximum",
			"type": "numeric"
		}
	]

---
## AWS

The AWS integration contains a tagging tool.  Each Circonus check will be reviewed (resolving FQDNs to IP addresses as needed).  Then, each Amazon EC2 instances in each Amazon EC2 region will be catalogued.  Every check in Circonus that has an IP address (including names resolved to IPs) will be matched against the EC2 instance inventory.  Each matching check will be tagged with the following tags:

 * ec2-region (Amazon EC2 Region)
 * ec2-zone (Amazon EC2 Availability Zone)
 * ec2-id (Amazon EC2 Instance Id)
 * ec2-type (Amazon EC2 Instance Type)

## AWS Cloudwatch Check Creation

The Circonus-CMI tool has the ability to create Cloudwatch checks based on the configuration file. At the moment, the following AWS Namespaces are supported:

 * AWS/AutoScaling
 * AWS/EBS
 * AWS/EC2
 * AWS/ELB
 * AWS/RDS
 
You may specify which dimensions you wish to create checks on in the configuration file. The following dimensions are available for each namespace:

 * autoscaling: AutoScalingGroupName
 * ebs: VolumeId
 * ec2: InstanceId, InstanceType, ImageId, AutoScalingGroupName
 * elb: LoadBalancerName, AvailabilityZone
 * rds: DBInstanceIdentifier, EngineName, DatabaseClass

Each namespace in the configuration file is represented by dropping the "AWS/" and listing the namespace in lower case ("AWS/EC2" is "ec2", "AWS/ELB" is "elb", etc). You may also specify "all" to get all available dimensions for a namespace, or "none" to remove all existing checks for a namespace. For example, if you wanted to create checks for InstanceId and InstanceType for AWS/EC2 and all available dimensions for AWS/ELB, you would set the following in the AWS config section:

	"ec2": [
		"InstanceId",
		"InstanceType"
	],
	"elb": [
		"all"
	]

The tool will tag each check in Circonus with all AWS tags associated with that namespace, as well as any tags relevant to the check (such as the instance id for an EC2 InstanceId check). These tags will have a namespacing prefix that can be specified in the "aws" section of the config file, specified as "aws_tag_prefix". If this is not specified, the prefix will be "aws_tag".

The field "id" will indicate the ID to put on each created check. For example, if you set an id of "cmi-tool", each check will be tagged "aws-id:cmi-tool". This will tell the tool which checks have been created by the tool. Only checks that are tagged with the given ID will be edited and looked at. If the id is changed, checks created with a previous id will not be looked at.

Circonus treats a ':' character as a separator for tags; therefore, colons can not be included as part of the key for each tags in your AWS instance. By default, circonus-cmi will replace each ':' character in the key with a '`' (backtick) character. However, if you wish to supply your own function to replace these characters, you may do so in the lib/UserDefined.js file. Write your own function here and specify to use it in the config file with the field name "tag_translation_function". For example, if you write a function called "translate_it" and wish to use that instead of the tool's default behavior, set a field of "tag_translation_function": "translate_it" in the config file.

The "granularity" AWS field allows you to specify either 1 (for one-minute data granularity) or 5 (for 5-minute data granularity). If not provided, it will default to 5.

The "cloudwatch_check_regions" field allows you to enter an array of regions you wish to pull data for. A complete list of these regions is listed in the example below. If you wish to pull all regions, you may enter an array with a value of "all" or simply omit the field, which will default to pulling data for all regions.

In addition to these aws config changes, you will need to configure the "circonus" section to create these checks. You will need to have a "cloudwatch" section, which contains numerous sub-fields. An example of this can be found above. Under cloudwatch, you will need to set the following things:

 * "update_checks": true (this tells the tool that you wish to create new checks and not just tag existing checks
 * "automated_check_name_addendum": <name> (this will add an addendum to the name of each check you create... if you leave this out, no addendum will be added and check names will be identical to those created by default in the GUI)

In addition, you will need to specify the brokers you wish to put checks on. You must have a section under "cloudwatch" called "brokers", where you will need to specify a default broker and (optionally) a specific broker for each cloudwatch region. For example:

	"brokers": {
		"default": "My Broker",
		"us-east-1": "My Broker",
		"us-west-1": "My Broker",
		"us-west-2": "My Broker",
		"eu-west-1": "My Broker",
		"eu-central-1": "My Broker",
		"ap-southeast-1": "My Broker",
		"ap-southeast-2": "My Broker",
		"ap-northeast-1": "My Broker",
		"sa-east-1": "My Broker"
	}

The broker name is the display name of your broker, viewable on your "Brokers" GUI page.

In addition to this, you may tag each of your enterprise brokers to match AWS tags. For example, if you have an EC2 instance tagged as follows:

"name:my_ec2_instance"

...you may tag your broker with the same tag. When determining what broker to put the check on, it will look for tags on the brokers that match AWS tags and put the check on the appropriate broker. You must precede the tag on the proker with the appropriate "aws_tag_prefix" value, followed by a dash. For example, if you have set an aws tag prefix of "aws-tag", you would tag your broker as follows:

"aws-tag-name:my_ec2_instance"

An example of a complete configuration across both circonus and aws for check creation would be:

	"circonus":
		{
			"auth_token": "asdfadsf",
			"app_name": "cmi-tool",
			"cloudwatch": {
				"update_checks": true,
				"automated_check_name_addendum": "Automated",
				"brokers": {
					"default": "My Broker",
					"us-east-1": "My Broker",
					"us-west-1": "My Broker",
					"us-west-2": "My Broker",
					"eu-west-1": "My Broker",
					"eu-central-1": "My Broker",
					"ap-southeast-1": "My Broker",
					"ap-southeast-2": "My Broker",
					"ap-northeast-1": "My Broker",
					"sa-east-1": "My Broker"
				}
			}
		},
	"aws":
		{
			"accessKeyId": "asdfasdf",
			"secretAccessKey": "qwerty",
			"region": "us-east-1",
			"id": "circonus-cmi",
			"aws_tag_prefix": "aws-tag",
			"tag_translation_function": "example_translate_tags",
			"granularity": 5,
			"cloudwatch_check_regions": [
				"us-east-1",
				"us-west-1",
				"us-west-2",
				"eu-west-1",
				"eu-central-1",
				"ap-southeast-1",
				"ap-southeast-2",
				"ap-northeast-1",
				"sa-east-1"
			],
			"ec2": [
				"InstanceId",
				"ImageId"
			],
			"elb": [
				"VolumeId"
			],
			"ebs": [
				"LoadBalancerName"
			],
			"rds": [
				"all"
			],
			"autoscaling": [
				"all"
			]
		}

Checks will be created for all available regions. The "region" field specified for "aws" will pull the initial data for getting inventory, but then all regions will be polled with relevant checks created.

