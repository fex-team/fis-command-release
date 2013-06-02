/*
 * fis
 * http://web.baidu.com/
 */

'use strict';

exports.name = 'release';
exports.desc = 'build and deploy your project';
exports.register = function(commander){
    
    function watch(opt){
        var root = fis.project.getProjectPath();
        var timer = -1;
        var safePathReg = /[\\\/][_\-.\s\w]+$/i;
        function listener(path){
            if(safePathReg.test(path)){
                clearTimeout(timer);
                timer = setTimeout(function(){
                    release(opt);
                }, 500);
            }
        }
        require('chokidar')
            .watch(root, {
                ignored : /[\/\\](?:output\b[^\/\\]*([\/\\]|$)|\.|fis-(?:conf|merge)\.json$)/i,
                persistent: true
            })
            .on('add', listener)
            .on('change', listener)
            .on('unlink', listener)
            .on('error', function(err){
                //fis.log.error(err);
            });
    }
    
    function time(fn){
        process.stdout.write('\n δ'.bold.yellow);
        var now = Date.now();
        fn();
        process.stdout.write((Date.now() - now + 'ms').green.bold);
        process.stdout.write('\n');
    }
    
    
    var lastModified = {};
    var collection = {};
    var deploy = require('./lib/deploy.js');
    
    function release(opt){
        var flag, cost, start = Date.now();
        process.stdout.write('\n Ω'.green.bold);
        opt.beforeEach = function(){
            flag = opt.debug ? '' : '.';
            cost = (new Date).getTime();
        };
        opt.afterEach = function(file){
            //cal compile time
            cost = (new Date).getTime() - cost;
            if(cost > 200){
                flag = flag.bold.yellow;
                fis.log.debug(file.realpath);
            } else if(cost < 100){
                flag = flag.grey;
            }
            var mtime = file.getMtime().getTime();
            //collect file to deploy
            if(file.release && lastModified[file.subpath] !== mtime){
                lastModified[file.subpath] = mtime;
                if(!collection[file.subpath]){
                    collection[file.subpath] = file;
                    process.stdout.write(flag);
                }
            }
        };
        
        opt.beforeCompile = function(file){
            if(!collection[file.subpath]){
                collection[file.subpath] = file;
                process.stdout.write(flag);
            }
        };
        
        //release
        fis.release(opt, function(ret){
            for(var item in collection){
                process.stdout.write(
                    (opt.debug ? '' : ' ') +
                    (Date.now() - start + 'ms').bold.green + '\n'
                );
                if(opt.unique){
                    time(fis.compile.clean);
                }
                if(collection.hasOwnProperty(item)){
                    deploy(opt.dest, opt.md5, collection);
                    deploy(opt.dest, opt.md5, ret.pkg);
                    collection = {};
                    return;
                }
            }
        });
    }
    
    commander
        .option('-d, --dest <names>', 'release output destination', String, 'preview')
        .option('-r, --root <path>', 'set project root')
        .option('-w, --watch', 'monitor the changes of project')
        .option('-c, --clean', 'clean compile cache', Boolean, false)
        .option('-m, --md5 [level]', 'md5 release option', Number)
        .option('-D, --domains', 'add domain name', Boolean, false)
        .option('-l, --lint', 'with lint', Boolean, false)
        .option('-o, --optimize', 'with optimize', Boolean, false)
        .option('-p, --pack', 'with package', Boolean, true)
        .option('--unique', 'use unique compile caching', Boolean, false)
        .option('--debug', 'debug mode', Boolean, false)
        .action(function(options){
            
            //configure log
            if(options.debug){
                fis.log.level = fis.log.L_ALL;
                fis.log.throw = true;
            }
            var root, conf, filename = fis.project.conf;
            if(options.root){
                root = fis.util.realpath(options.root);
                if(fis.util.isDir(root)){
                    if(fis.util.isFile(root + '/' + filename)){
                        conf = root + '/' + filename;
                    }
                    delete options.root;
                } else {
                    fis.log.error('invalid project root path [' + options.root + ']');
                }
            } else{
                //try to find fis-conf.js
                var cwd = root = fis.util.realpath(process.cwd()),
                    pos = cwd.length;
                do {
                    cwd  = cwd.substring(0, pos);
                    conf = cwd + '/' + filename;
                    if(fis.util.exists(conf)){
                        root = cwd;
                        break;
                    } else {
                        conf = false;
                        pos = cwd.lastIndexOf('/');
                    }
                } while(pos > 0);
            }
            
            process.title = 'fis ' + process.argv.splice(2).join(' ') + ' [ ' + root + ' ]';
            
            if(conf){
                var cache = fis.cache(conf, 'conf');
                if(!cache.revert()){
                    options.clean = true;
                    cache.save();
                }
                require(conf);
            } else {
                fis.log.warning('unable to find fis-conf file [' + filename + ']');
            }
            
            if(options.clean){
                time(function(){
                    fis.cache.clean('compile');
                });
            }
            delete options.clean;
            
            //domain, fuck EventEmitter
            if(options.domains){
                options.domain = true;
                delete options.domains;
            }
            
            switch (typeof options.md5){
                case 'undefined':
                    options.md5 = 0;
                    break;
                case 'boolean':
                    options.md5 = options.md5 ? 1 : 0;
                    break;
                default :
                    options.md5 = isNaN(options.md5) ? 0 : parseInt(options.md5);
            }
            //md5 > 0, force release hash file
            options.hash = options.md5 > 0;
            
            //init project
            fis.project.setProjectRoot(root);
            //merge standard conf
            fis.config.merge({
                modules : {
                    postprocessor : {
                        js : 'jswrapper'
                    },
                    optimizer : {
                        js : 'uglify-js',
                        css : 'clean-css',
                        htm : 'html-minifier',
                        html : 'html-minifier'
                    }
                }
            });
            
            if(options.watch){
                watch(options);
            } else {
                release(options);
            }
        });
};