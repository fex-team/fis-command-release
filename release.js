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
        var safePathReg = /^[:\\\/ _\-.\w]+$/i;
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
                ignored : /[\/\\](?:output\b[^\/\\]*([\/\\]|$)|\.)/i,
                persistent: true
            })
            .on('add', listener)
            .on('change', listener)
            .on('unlink', listener)
            .on('error', function(err){
                fis.log.error(err);
            });
    }
    
    
    var lastModified = {};
    var collection = {};
    var deploy = require('./lib/deploy.js');
    
    function release(opt){
        var flag, cost, start = Date.now();
        process.stdout.write(' Ω'.green.bold);
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
                if(collection.hasOwnProperty(item)){
                    process.stdout.write(
                        (opt.debug ? '' : ' ') +
                        (Date.now() - start + 'ms').bold.green + '\n'
                    );
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
        .option('-w, --watch', 'monitor the changes of project')
        .option('-c, --clean', 'clean compile cache', Boolean, false)
        .option('--md5 <level>', 'md5 release option', parseInt, 0)
        .option('-D, --domains', 'add domain name', Boolean, false)
        .option('-L, --lint', 'with lint', Boolean, false)
        .option('-O, --optimize', 'with optimize', Boolean, false)
        .option('-P, --pack', 'with package', Boolean, true)
        .option('--debug', 'debug mode', Boolean, false)
        .action(function(options){
            
            //configure log
            if(options.debug){
                fis.log.level = fis.log.L_ALL;
                fis.log.throw = true;
            }
            //try to find fis-conf.js
            var root = fis.util.realpath(process.cwd()),
                cwd = root,
                filename = fis.project.conf,
                pos = cwd.length, conf;
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
            
            process.title = 'fis ' + process.argv.splice(2).join(' ') + ' [ ' + root + ' ]';
            
            if(options.clean){
                process.stdout.write(' δ'.bold.yellow);
                var now = Date.now();
                fis.cache.clean('compile');
                process.stdout.write((Date.now() - now + 'ms').green.bold);
                process.stdout.write('\n');
            }
            delete options.clean;
            
            //domain, fuck EventEmitter
            if(options.domains){
                options.domain = true;
                delete options.domains;
            }
            //md5 > 0, force release hash file
            options.hash = options.md5 > 0;
            
            //init project
            fis.project.setProjectRoot(root);
            //merge standard conf
            fis.config.merge(fis.util.readJSON(__dirname + '/standard.json'));
            
            if(conf){
                var cache = new fis.cache.Cache(conf, 'conf');
                if(!cache.revert()){
                    var tmp = fis.compile.setup(options);
                    fis.cache.clean(tmp);
                    cache.save();
                }
                require(conf);
            } else {
                fis.log.warning('unable to find fis-conf file [' + filename + ']');
            }
            
            if(options.watch){
                watch(options);
            } else {
                release(options);
            }
        });
};