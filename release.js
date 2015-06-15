/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

exports.name = 'release';
exports.desc = 'build and deploy your project';
exports.register = function(commander){

    function watch(opt){
        var root = fis.project.getProjectPath();
        var timer = -1;
        var safePathReg = /[\\\/][_\-.\s\w]+$/i;
        var ignoredReg = /[\/\\](?:output\b[^\/\\]*([\/\\]|$)|\.|fis-conf\.js$)/i;
        
        // init cache
        var files = fis.project.getSource();
        fis.util.map(files, function (subpath, file) {
            opt.srcCache = opt.srcCache || [];
            opt.srcCache.push(file.realpath);
        });

        // first compile
        release(opt);
        
        function listener(type){
            return function (path) {
                var p;
                if(safePathReg.test(path)){
                    var path = fis.util(path);
                    if (type == 'add' || type == 'change') {
                        if (opt.srcCache.indexOf(path) == -1) {
                            opt.srcCache.push(path);
                        }
                    } else if (type == 'unlink') {
                        if ((p = opt.srcCache.indexOf(path)) > -1) {
                            opt.srcCache.splice(p, 1);
                        }
                    } else if (type == 'unlinkDir') {
                        var toDelete = [];

                        opt.srcCache.forEach(function(realpath, index) {
                            realpath.indexOf(path) === 0 && toDelete.unshift(index);
                        });

                        toDelete.forEach(function(index) {
                            opt.srcCache.splice(index, 1);
                        });
                    }
                    clearTimeout(timer);
                    timer = setTimeout(function() {
                        release(opt);
                    }, 500);
                }
            };
        }

        require('chokidar')
            .watch(root, {
                ignored : function(path) {
                    var adjustPath = fis.util(path).replace(fis.project.getProjectPath(), '');
                    if (adjustPath == '') return false; // if path == project.root
                    // first chokidar emit add event
                    if (adjustPath[0] != '/') adjustPath = '/' + adjustPath;

                    var include = fis.config.get('project.include');
                    var exclude = fis.config.get('project.exclude');

                    if (!fis.util.filter(adjustPath, include, exclude)) {
                        return true;
                    }

                    var ignored = ignoredReg.test(adjustPath);

                    if (fis.config.get('project.watch.exclude')){
                        ignored = ignored ||
                            fis.util.filter(adjustPath, fis.config.get('project.watch.exclude'));
                    }

                    return ignored;
                },
                usePolling: fis.config.get('project.watch.usePolling', null),
                persistent: true,
                ignoreInitial: true
            })
            .on('add', listener('add'))
            .on('change', listener('change'))
            .on('unlink', listener('unlink'))
            .on('unlinkDir', listener('unlinkDir'))
            .on('error', function(err) {
                err.message += fis.cli.colors.red('\n\tYou can set `fis.config.set("project.watch.usePolling", true)` fix it.');
                fis.log.error(err);
            });
    }

    function time(fn){
        process.stdout.write('\n δ '.bold.yellow);
        var now = Date.now();
        fn();
        process.stdout.write((Date.now() - now + 'ms').green.bold);
        process.stdout.write('\n');
    }

    var LRServer, LRTimer;
    function reload(){
        if(LRServer && LRServer.connections) {
            fis.util.map(LRServer.connections, function(id, connection){
                try {
                    connection.send({
                        command: 'reload',
                        path: '*',
                        liveCSS: true
                    });
                } catch (e) {
                    try {
                        connection.close();
                    } catch (e) {}
                    delete LRServer.connections[id];
                }
            });
        }
    }

    var lastModified = {};
    var collection = {};
    var total = {};
    var deploy = require('./lib/deploy.js');

    deploy.done = function(){
        clearTimeout(LRTimer);
        LRTimer = setTimeout(reload, fis.config.get('livereload.delay', 200));
    };

    function release(opt){
        var flag, cost, start = Date.now();
        process.stdout.write('\n Ω '.green.bold);
        opt.beforeEach = function(file){
            flag = opt.verbose ? '' : '.';
            cost = (new Date).getTime();
            total[file.subpath] = file;
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
                if(!collection[file.subpath]){
                    process.stdout.write(flag);
                }
                lastModified[file.subpath] = mtime;
                collection[file.subpath] = file;
            }
        };

        opt.beforeCompile = function(file){
            collection[file.subpath] = file;
            process.stdout.write(flag);
        };

        try {
            //release
            fis.release(opt, function(ret){
                process.stdout.write(
                    (opt.verbose ? '' : ' ') +
                    (Date.now() - start + 'ms').bold.green + '\n'
                );
                var changed = false;
                fis.util.map(collection, function(key, file){
                    //get newest file from src
                    collection[key] = ret.src[key] || file;
                    changed = true;
                });
                if (changed){
                    if(opt.unique){
                        time(fis.compile.clean);
                    }
                    fis.util.map(ret.pkg, function(subpath, file){
                        collection[subpath] = file;
                        total[subpath] = file;
                    });
                    deploy(opt, collection, total);
                    collection = {};
                    total = {};
                    return;
                }
            });
        } catch(e) {
            process.stdout.write('\n [ERROR] ' + (e.message || e) + '\n');
            if(opt.watch){
                process.stdout.write('\u0007');
            } else if(opt.verbose) {
                throw e;
            } else {
                process.exit(1);
            }
        }
    }

    commander
        .option('-d, --dest <names>', 'release output destination', String, 'preview')
        .option('-m, --md5 [level]', 'md5 release option', Number)
        .option('-D, --domains', 'add domain name', Boolean, false)
        .option('-l, --lint', 'with lint', Boolean, false)
        .option('-t, --test', 'with unit testing', Boolean, false)
        .option('-o, --optimize', 'with optimizing', Boolean, false)
        .option('-p, --pack', 'with package', Boolean, true)
        .option('-w, --watch', 'monitor the changes of project')
        .option('-L, --live', 'automatically reload your browser')
        .option('-c, --clean', 'clean compile cache', Boolean, false)
        .option('-r, --root <path>', 'set project root')
        .option('-f, --file <filename>', 'set fis-conf file')
        .option('-u, --unique', 'use unique compile caching', Boolean, false)
        .option('--verbose', 'enable verbose output', Boolean, false)
        .action(function(){

            var options = arguments[arguments.length - 1];

            fis.log.throw = true;

            //configure log
            if(options.verbose){
                fis.log.level = fis.log.L_ALL;
            }
            var root, conf, filename = 'fis-conf.js';
            if(options.file){
                if(fis.util.isFile(options.file)){
                    conf = fis.util.realpath(options.file);
                } else {
                    fis.log.error('invalid fis config file path [' + options.file + ']');
                }
            }
            if(options.root){
                root = fis.util.realpath(options.root);
                if(fis.util.isDir(root)){
                    if(!conf && fis.util.isFile(root + '/' + filename)){
                        conf = root + '/' + filename;
                    }
                    delete options.root;
                } else {
                    fis.log.error('invalid project root path [' + options.root + ']');
                }
            } else {
                root = fis.util.realpath(process.cwd());
                if(!conf){
                    //try to find fis-conf.js
                    var cwd = root, pos = cwd.length;
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
            }

            //init project
            fis.project.setProjectRoot(root);

            process.title = 'fis ' + process.argv.splice(2).join(' ') + ' [ ' + root + ' ]';

            if(conf){
                var cache = fis.cache(conf, 'conf');
                if(!cache.revert()){
                    options.clean = true;
                    cache.save();
                }
                require(conf);
                fis.emitter.emit('fis-conf:loaded');
            } else {
                fis.log.warning('missing config file [' + filename + ']');
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

            if(options.live){
                var LiveReloadServer = require('livereload-server-spec');
                var port = fis.config.get('livereload.port', 8132);
                LRServer = new LiveReloadServer({
                    id: 'com.baidu.fis',
                    name: 'fis-reload',
                    version : fis.cli.info.version,
                    port : port,
                    protocols: {
                        monitoring: 7
                    }
                });
                LRServer.on('livereload.js', function(req, res) {
                    var script = fis.util.fs.readFileSync(__dirname + '/vendor/livereload.js');
                    res.writeHead(200, {
                        'Content-Length': script.length,
                        'Content-Type': 'text/javascript',
                        'Connection': 'close'
                    });
                    res.end(script);
                });
                LRServer.listen(function(err) {
                    if (err) {
                        err.message = 'LiveReload server Listening failed: ' + err.message;
                        fis.log.error(err);
                    }
                });
                process.stdout.write('\n Ψ '.bold.yellow + port + '\n');
                //fix mac livereload
                process.on('uncaughtException', function (err) {
                    if(err.message !== 'read ECONNRESET') throw  err;
                });
                //delete options.live;
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

            if(options.watch){
                watch(options);
            } else {
                release(options);
            }
        });
};
