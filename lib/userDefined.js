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

/* This library is for user-defined functions. 
 * All functions must be in the "func.prototype" 
 * namespace to be properly exported. */

var func = function() {
};

/* TAG TRANSLATION FUNCTIONS
 * Put your custom AWS tag translation functions here. All tag translation
 * functions must take four arguments:
 *
 * - The array of AWS tags to parse
 * - The array to put the new tags into
 * - The prefix for all AWS tags (for example - "aws-tag")
 * - The AWS namespace you are making tags for
 *
 * An example function is provided here. It will 
 * replace all colons in the tag name with backticks.
 *
 */
func.prototype.example_translate_tags = function(aws_tags, circonus_tags, prefix, namespace) {
    if (aws_tags) {
        aws_tags.map(function(tobj) {
            if(tobj.Key !== null && tobj.Value !== null) {
                var new_name = prefix + "-" + tobj.Key.toLowerCase();
                new_name = new_name.replace(/:/g, "`");
                circonus_tags.push(new_name + ':' + tobj.Value.toLowerCase());
            }
        });
    }
};

/* OTHER FUNCTIONS
 * Put your other custom functions here.
 */

module.exports = func;

