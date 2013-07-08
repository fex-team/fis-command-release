/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

function upload(receiver, to, release, content, subpath){
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
            }
        }
    );
}

function deliver(output, md5, release, content, file){
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
}

function replaceFrom(path, from){
    if(path.indexOf(from) === 0){
        from = from.replace(/\/$/, '');
        var index = from.lastIndexOf('/');
        if(index < 1){
            return path;
        } else {
            return path.substring(index);
        }
    } else {
        return path;
    }
}

function deploy(dest, file){
    if(file.release){
        var release = replaceFrom(file.release, dest.from);
        var content = file.getContent();
        var charset = file.charset;
        if(file.isText() && content.length && charset !== 'utf8' && charset !== 'utf-8'){
            content = fis.util.toEncoding(content, charset);
        }
        if(dest.receiver){
            if(!file.useHash || dest.md5 != 1){
                upload(dest.receiver, dest.to, release, content, file.subpath);
            }
            if(file.useHash && dest.md5 > 0){
                upload(dest.receiver, dest.to, file.getHashRelease(release), content, file.subpath);
            }
        } else {
            deliver(dest.to, dest.md5, release, content, file);
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

function factory(opt, md5, root){
    opt.md5 = md5;
    opt.root = opt.root || root;
    opt.from = normilize(opt.from);
    opt.to = fis.util(opt.to);
    return opt;
}

module.exports = function(dest, md5, collection){
    var settings = fis.config.get('deploy', {});
    var root = fis.project.getProjectPath();
    var dests = [];
    var cwd = process.cwd();
    dest.split(/,/g).forEach(function(d){
        var opt = settings[d] || {};
        if(fis.util.is(opt, 'Array')){
            opt.forEach(function(item){
                dests.push(factory(item, md5, root));
            });
        } else {
            if(opt.to){
                //do nothing
            } else if(d[0] === '.'){
                opt.to = cwd + '/' +  d;
            } else if(/^output\b/.test(d)){
                opt.to = root + '/' +  d;
            } else if(d === 'preview'){
                opt.to = fis.project.getTempPath('www');
            } else if(fis.util.isAbsolute(d)) {
                opt.to = d;
            } else {
                fis.log.error('invalid deploy destination options [' + d + ']');
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
                deploy(d, file);
            }
        });
    });
};