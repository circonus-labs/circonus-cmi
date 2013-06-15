# circonus-cmi

## Overview

circonus-cmi is a command line tool written in [Node.JS](http://nodejs.org/) to control of [Circonus]() checks based on [Chef Server](http://wiki.opscode.com/display/chef/Home) and [AWS](http://aws.amazon.com/). Support for [Puppet](https://puppetlabs.com/) coming soon.

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
		"authtoken": "asdfadsf"
	}

### AWS

circonus-cmi uses the [aws-sdk](https://npmjs.org/package/aws-sdk) module. An AWS access key id and secret access key will be needed. Full configuration options can be found with in the module documentation.  An example config:

	{
		"accessKeyID": "asdfasdf",
		"secretAccessKey": "qwerty",
		"region": "us-east-1"
	}

### Chef

circonus-cmi uses the [chef-api](https://npmjs.org/package/chef-api) module. Full configuration options can be found with in the module documentation. Example:

	{
		"client_name": "foo",
		"key_path": "foo.pem",
		"url": "https://chef.example.com/organizations/foobar"
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
		"foobaz",
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

The AWS integration currently is a tagging tool.  Each Circonus check will be reviewed (resolving FQDNs to IP addresses as needed).  Then, each Amazon EC2 instances in each Amazon EC2 region will be catalogued.  Every check in Circonus that has an IP address (including names resolved to IPs) will be matched against the EC2 instance inventory.  Each matching check will be tagged with the following tags:

 * ec2-region (Amazon EC2 Region)
 * ec2-zone (Amazon EC2 Availability Zone)
 * ec2-id (Amazon EC2 Instance Id)
 * ec2-type (Amazon EC2 Instance Type)
