/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

function upload(receiver, to, release, content, subpath, callback){
    fis.util.upload(
        //url, request options, post data, file
        receiver, null, { to : to + release }, content, subpath,
        function(err, res){
            if(err || res != '0'){
                fis.log.error('upload file [' + subpath + '] to [' + to +
                    '] by receiver [' + receiver + '] error [' + (err || res) + ']');
            } else {
                var time = '[' + fis.log.now(true) + ']';
                process.stdout.write(
                    ' - '.green.bold +
                    time.grey + ' ' + 
                    subpath.replace(/^\//, '') +
                    ' >> '.yellow.bold +
                    to + release +
                    '\n'
                );
                callback();
            }
        }
    );
}

function deliver(output, md5, release, content, file, callback){
    if(!release){
        fis.log.error('unable to get release path of file['
            + file.realpath
            + ']: Maybe this file is neither in current project or releasable');
    }
    if(fis.util.exists(output) && !fis.util.isDir(output)){
        fis.log.error('unable to deliver file['
            + file.realpath + '] to dir['
            + output + ']: invalid output dir.');
    }
    var target;
    if(md5 == 0 || !file.useHash){
        target = fis.util(output, release);
        fis.util.write(target, content);
    } else if(md5 == 1){
        target = fis.util(output, file.getHashRelease(release));
        fis.util.write(target, content);
    } else {
        target = fis.util(output, release);
        fis.util.write(target, content);
        
        target = fis.util(output, file.getHashRelease(release));
        fis.util.write(target, content);
    }
    callback();
}

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

function deploy(dest, file, callback){
    if(file.release){
        var release = replaceFrom(file.release, dest.from, dest.subOnly);
        var content = file.getContent();
        var charset = file.charset;
        if(file.isText() && content.length && charset !== 'utf8' && charset !== 'utf-8'){
            content = fis.util.toEncoding(content, charset);
        }
        if(dest.receiver){
            if(!file.useHash || dest.md5 != 1){
                upload(dest.receiver, dest.to, release, content, file.subpath, callback);
            }
            if(file.useHash && dest.md5 > 0){
                upload(dest.receiver, dest.to, file.getHashRelease(release), content, file.subpath, callback);
            }
        } else {
            deliver(dest.to, dest.md5, release, content, file, callback);
        }
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

var cwd = process.cwd();
function factory(opt, md5, root){
    var ret = fis.util.clone(opt);
    ret.md5 = md5;
    ret.root = ret.root || root;
    ret.from = normilize(ret.from);
    if(ret.to[0] === '.'){
        ret.to = fis.util(cwd + '/' +  ret.to);
    } else if(/^output\b/.test(ret.to)){
        ret.to = fis.util(root + '/' +  ret.to);
    } else if(ret.to === 'preview'){
        ret.to = fis.project.getTempPath('www');
    } else {
        ret.to = fis.util(ret.to);
    }
    return ret;
}

var tasks = [];
var running = 0;

function doTask(){
    if(tasks.length){
        if(running < exports.MAX_TASK_SIZE){
            var task = tasks.shift();
            running++;
            deploy(task.dest, task.file, function(){
                running--;
                setTimeout(doTask, 0);
            });
        } else {
            setTimeout(doTask, 1000);
        }
    } else {
        running = 0;
        exports.done();
    }
}

exports = module.exports = function(dest, md5, collection){
    var settings = fis.config.get('deploy', {});
    var root = fis.project.getProjectPath();
    var dests = [];
    dest.split(/,/g).forEach(function(d){
        var opt = settings[d] || {};
        if(fis.util.is(opt, 'Array')){
            opt.forEach(function(item){
                dests.push(factory(item, md5, root));
            });
        } else {
            if(!opt.to){
                if(
                    d === 'preview' ||              //release to preivew
                    /^(?:\.|output\b)/.test(d) ||  //release to output
                    fis.util.isAbsolute(d)          //absolute path
                ){
                    opt.to = d;
                } else {
                    fis.log.error('invalid deploy destination options [' + d + ']');
                }
            }
            dests.push(factory(opt, md5, root));
        }
    });
    fis.util.map(collection, function(subpath, file){
        dests.forEach(function(d){
            if(
                file.release &&
                file.release.indexOf(d.from) === 0 &&   //relate to replaceFrom
                fis.util.filter(file.subpath, d.include, d.exclude)
            ){
                tasks.push({dest : d, file : file });
            }
        });
    });
    doTask();
};

//for callback
exports.done = function(){};
exports.MAX_TASK_SIZE = 5;