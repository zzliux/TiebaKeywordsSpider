var fs = require('fs');
var cfg = require('./config');


var kw = cfg.kw;
var savePath = cfg.savePath;
var hiRateNum = cfg.hiRateNum;


var s = fs.readFileSync(savePath + kw + '.kw');
s = JSON.parse(s);
var lstkey;
var keys = [];
/* 获取所有的key以及顺序 */
for(key in s){
	keys.push(key);
}

/* 冒泡hiRateNum轮 */
for(var j=0; j<hiRateNum; j++){
	for(var i=keys.length-1; i>=j; i--){
		if(s[keys[i-1]] < s[keys[i]]){
			var t = keys[i];
			keys[i] = keys[i-1];
			keys[i-1] = t;
		}
	}
}

var out = [];
for(var i=0; i<hiRateNum; i++){
	out.push({
		key:keys[i],
		times:s[keys[i]]
	});
}

module.exports = out;