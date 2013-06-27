/*
 * fis
 * http://fis.baidu.com/
 */

'use strict';

function upload(receiver, to, release, file){
    fis.util.upload(
        //url, request options, post data, file
        receiver, null, { to : to + release }, file,
        function(err, res){
            if(err || res != '0'){
                fis.log.error('upload file [' + file.subpath + '] to [' + to +
                    '] by receiver [' + receiver + '] error [' + (err || res) + ']');
            } else {
                var time = '[' + fis.log.now(true) + ']';
                process.stdout.write(
                    ' - '.green.bold +
                    time.grey + ' ' + 
                    file.subpath.replace(/^\//, '') +
                    ' >> '.yellow.bold +
                    to + release +
                    '\n'
                );
            }
        }
    );
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
        if(dest.receiver){
            if(!file.useHash || dest.md5 != 1){
                upload(dest.receiver, dest.to, release, file);
            }
            if(file.useHash && dest.md5 > 0){
                upload(dest.receiver, dest.to, file.getHashRelease(release), file);
            }
        } else {
            file.deliver(dest.to, dest.md5, release);
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