# fis-command-release

## Usage

    Usage: release [options]
    
    Options:
    
        -h, --help          output usage information
        -d, --dest <names>  release output destination
        -r, --root <path>   set project root
        -w, --watch         monitor the changes of project
        -L, --live          automatically reload your browser
        -c, --clean         clean compile cache
        -m, --md5 [level]   md5 release option
        -D, --domains       add domain name
        -l, --lint          with lint
        -t, --test          with unit testing
        -o, --optimize      with optimizing
        -p, --pack          with package
        -u, --unique        use unique compile caching
        --verbose           enable verbose output
        
## 关于文件接收器 receiver.php

**此代码存在很大的安全隐患，没有做任何安全考虑，请不要部署到线上服务。**

百度内部请使用：http://agroup.baidu.com/fis/md/article/196978
