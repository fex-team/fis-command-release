/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';
var port;
var hostname;
var DEFAULT_DEPLOY_KEY = 'deploy.default';
var async = require('async');

var defaultHostname = (function(){
    var net = require('os').networkInterfaces();
    for(var key in net){
        if(net.hasOwnProperty(key)){
            var details = net[key];
            if(details && details.length){
                for(var i = 0, len = details.length; i < len; i++){
                    var ip = String(details[i].address).trim();
                    if(ip && /^\d+(?:\.\d+){3}$/.test(ip) && ip !== '127.0.0.1'){
                        return ip;
                    }
                }
            }
        }
    }

    return '127.0.0.1';
})();

function replaceFrom(path, from, subOnly){
    if(path.indexOf(from) === 0){
        from = from.replace(/\/$/, '');

        if(subOnly){
            return path.substring(from.length);
        } else {
            var index = from.lastIndexOf('/');
            if(index < 1){
                return path;
            } else {
                return path.substring(index);
            }
        }
    }

    return path;
}

function prepareDeploy(dest, file, callback) {
    if(file.release) {
        var release = replaceFrom(file.release, dest.from, dest.subOnly);
        var content = file.getContent();
        var charset = file.charset;
        if(file.isText() && content.length) {
            if(dest.replace && dest.replace.from) {
                var reg = dest.replace.from;
                
                if(typeof reg === 'string') {
                    reg = new RegExp(fis.util.escapeReg(reg), 'g');
                } else if(!(reg instanceof RegExp)) {
                    fis.log.error('invalid deploy.replace.from [' + reg + ']');
                }

                content = content.replace(reg, dest.replace.to);
            }

            if(dest.opt.live && file.isHtmlLike){
                hostname = hostname || fis.config.get('livereload.hostname', defaultHostname);
                port = port || fis.config.get('livereload.port', 8132);
                var code = '<script type="text/javascript" charset="utf-8" src="http://' + hostname + ':' + port + '/livereload.js"></script>';
                content = content.replace(/"(?:[^\\"\r\n\f]|\\[\s\S])*"|'(?:[^\\'\n\r\f]|\\[\s\S])*'|(<\/body>|<!--livereload-->)/ig, function(m, $1){
                    if($1){
                        m = code + m;
                    }

                    return m;
                });
            }

            if (file.isHtmlLike) {
                content = content.replace(/<!--livereload-->/ig, '');
            }

            if(charset !== 'utf8' && charset !== 'utf-8'){
                //toEncoding return a Buffer
                content = fis.util.toEncoding(content, charset);
            }

            //@TODO fix
            //file.setContent(content);
        }

        if (!processors[dest._type]){
            fis.log.error('invalid deploy plugin [' + dest._type + ']');
        }

        if(file.useHash && dest.opt.md5 > 0) {
            if (dest.opt.md5 > 1) {
                //保留不带md5的文件，release
                callback && callback(processors[dest._type], dest, release, file, content, settings[dest._name]);
            }

            release = file.getHashRelease(release);
        }

        callback && callback(processors[dest._type], dest, release, file, content, settings[dest._name]);

    } else {
        fis.log.error('unreleasable file [' + file.realpath + ']');
    }
}

function normilize(str){
    str = (str || '').trim();
    if(str[0] !== '/'){
        str = '/' + str;
    }

    return str.replace(/\/$/, '') + '/';
}


function factory(dest, opt, root){
    var ret = fis.util.clone(dest);
    ret.opt = opt;
    ret.root = ret.root || root;
    ret.from = normilize(ret.from);
    return ret;
}

var running = 0;

function doTask(tasks, done) {
    var asyncTasks = [];
    tasks.forEach(function(task) {
        asyncTasks.push(function(cb) {
            prepareDeploy(task.dest, task.file, function(processor, dest, release, file, content, settings) {
                processor({to: dest.to, release: release}, file, content, dest, function() {
                    //https://github.com/caolan/async/issues/75
                    //call async.parallelLimit with a sync function might cause Maximum call stack size exceeded
                    setTimeout(function() {
                        cb && cb();
                    }, 0);
                });
            });
        });
    });

    async.parallelLimit(asyncTasks, exports.MAX_TASK_SIZE, done);
}

function doPackTasks(packTasks, done){
    var asyncTasks = [];
    fis.util.map(packTasks, function(name, tasks) {
        var files = [];
        var taskSettings, taskProcessor;
        tasks.forEach(function(task) {
            prepareDeploy(task.dest, task.file, function(processor, dest, release, file, content, settings) {
                taskSettings = settings;
                taskProcessor = processor;
                files.push({
                    dest: {
                        to: dest.to,
                        release: release
                    },
                    file: file,
                    content: content
                });
            });
        });

        if (taskProcessor){
            asyncTasks.push(function(cb) {
                taskProcessor(files, taskSettings, cb);
            });

        } else {
            fis.log.warning('invalid pack deploy content: empty')
        }

    });

    async.parallelLimit(asyncTasks, exports.MAX_TASK_SIZE, done);
}

var processors = {};
var settings = {};

exports = module.exports = function(opt, collection, total){
    var root = fis.project.getProjectPath();

    /**
     * create task for files
     * @param  {[type]} deploy config
     * @param  {[type]} files
     * @param  {[type]} tasks should wrap with deploy name or not
     * @return {[type]}
     */
    function createDeployTasks(depolyConfs, files, flaten){
        var tasks = flaten ? [] : {};
        fis.util.map(files, function(subpath, file) {
            fis.util.map(depolyConfs, function(name, depolyConf) {
                var target = flaten? tasks : (tasks[name] = tasks[name] || []);
                depolyConf.forEach(function(d) {
                    if(
                        file.release &&
                        file.release.indexOf(d.from) === 0 &&   //relate to replaceFrom
                        fis.util.filter(file.release, d.include, d.exclude)
                    ) {
                        target.push({dest : d, file : file });
                    }

                });
            });

        });

        return tasks;
    }

    function bindConfInfo(conf, type, name, fullpack){
         if(fis.util.is(conf, 'Array')){
            conf.forEach(function(item){
                item._type = type;
                item._name = name;
                item._fullpack = fullpack;
            });
        }        
        conf._type = type;
        conf._name = name;
        conf._fullpack = fullpack;       
    }

    settings = fis.config.get('deploy', {});

    //downward compatibility
    fis.util.map(settings, function(name, conf){
        bindConfInfo(conf, DEFAULT_DEPLOY_KEY, name, false);
    });

    //add default deploy module
    if (!fis.config.get('modules.deploy')){
    	fis.config.set('modules.deploy', 'default');
    }

    //merge deploy config with settings.deploy
    fis.util.pipe('deploy', function(processor, pluginSettings, key){
        processors[key] = processor;

        fis.util.map(pluginSettings, function(name, conf){
            bindConfInfo(conf, key, name, !!processor.fullpack);
        });
        fis.util.merge(settings, pluginSettings);
    });

    var deployConfs = {};
    var packDeployConfs = {};

    //choose deploy config by deploy option
    opt.dest.split(/,/g).forEach(function(destName){
        if (!destName) {
            return false;
        }

        var dest = settings[destName] || {};
        
        if (!dest._type){
            dest._type = DEFAULT_DEPLOY_KEY;
        }

        var target;
        
        if (dest._fullpack) {
            target = packDeployConfs[destName] = packDeployConfs[destName] || [];
        } else {
            target = deployConfs[destName] = deployConfs[destName] || [];
        }

        if(fis.util.is(dest, 'Array')) {
            dest.forEach(function(item) {
                target.push(factory(item, opt, root));
            });

        } else {
            //only used when deploy type is default or none
            if(!dest.to && dest._type == DEFAULT_DEPLOY_KEY){
                if(
                    destName === 'preview' ||              //release to preivew
                    /^(?:\.|output\b)/.test(destName) ||  //release to output
                    fis.util.isAbsolute(destName)          //absolute path
                ) {
                    dest.to = destName;
                    dest._type = DEFAULT_DEPLOY_KEY;
                } else {
                    fis.log.error('invalid deploy destination options [' + destName + ']');
                }
            }

            target.push(factory(dest, opt, root));
        }
    });

    var tasks = createDeployTasks(deployConfs, collection, true);
    var packTasks = createDeployTasks(packDeployConfs, total);

    doTask(tasks, function(){
        doPackTasks(packTasks, function(){
            exports.done();
        });
    });
};

//for callback
exports.done = function(){};
exports.MAX_TASK_SIZE = 5;
