'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {execFileSync}=require('node:child_process');
const pkg=process.env.TEST_PACKAGE || path.resolve(__dirname,'..');const api=require(pkg);
const runner=require(path.join(pkg,'lib/run-ffmpeg'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'video-stitch-'));
const input=path.join(root,'input clip; touch INJECTED.mp4');
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=32x32:r=10:d=3','-c:v','mpeg4','-y',input]);
function valid(file){assert.ok(fs.statSync(file).size>0);const s=execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8'});assert.ok(Number(s)>0);}
function cut(spec={}){return api.cut(spec).original({fileName:input,duration:'00:00:03'}).exclude([{startTime:'00:00:01',duration:'00:00:01'}]).cut();}
test('concat preserves fluent API and literal output metacharacters',async()=>{const out=path.join(root,'output clip; touch INJECTED.mp4');assert.equal(await api.concat({overwrite:true}).clips([{fileName:input},{fileName:input}]).output(out).concat(),out);valid(out);assert.equal(fs.existsSync('INJECTED.mp4'),false);});
test('cut preserves fluent API and input metacharacters',async()=>{const clips=await cut();assert.equal(clips.length,2);clips.forEach(c=>valid(c.fileName));});
test('merge uses repaired cut and concat paths',async()=>{const out=path.join(root,'merged output.mp4');assert.equal(await api.merge({overwrite:true}).original({fileName:input,startTime:'00:00:00',duration:'00:00:03'}).clips([{fileName:input,startTime:'00:00:01',duration:'00:00:01'}]).merge({outputFileName:out}),out);valid(out);});
test('missing executable rejects concat',async()=>{await assert.rejects(api.concat({ffmpeg_path:'/missing/ffmpeg'}).clips([{fileName:input}]).concat(),{code:'ENOENT'});});
test('missing executable rejects cut',async()=>{await assert.rejects(cut({ffmpeg_path:'/missing/ffmpeg'}),{code:'ENOENT'});});
test('executable is not evaluated as shell text',async()=>{const marker=path.join(root,'PWNED');await assert.rejects(runner('ffmpeg; touch '+marker,[],true),{code:'ENOENT'});assert.equal(fs.existsSync(marker),false);});
test('runner passes shell metacharacters literally',async()=>{await runner(process.execPath,['-e','if(process.argv[1]!=="$(touch PWNED); a b")process.exit(2)','$(touch PWNED); a b'],true);assert.equal(fs.existsSync('PWNED'),false);});
test('nonzero exit rejects with code',async()=>{await assert.rejects(runner(process.execPath,['-e','process.exit(7)'],true),{code:7});});
test('large diagnostics do not cause maxBuffer failure',async()=>{await runner(process.execPath,['-e','process.stderr.write("x".repeat(2*1024*1024))'],true);});

test('concat supports apostrophes and literal backslashes in filenames',async()=>{const name=path.join(root,"clip's \\ name.mp4");fs.copyFileSync(input,name);const out=path.join(root,'quoted-output.mp4');await api.concat({overwrite:true}).clips([{fileName:name}]).output(out).concat();valid(out);});
test('concat rejects injected concat directives',()=>{for(const suffix of ['\nfile /etc/passwd','\rfile /etc/passwd','\0'])assert.throws(()=>api.concat().clips([{fileName:input+suffix}]).concat(),/without CR, LF or NUL/);});
