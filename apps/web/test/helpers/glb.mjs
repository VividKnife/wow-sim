export function geometryOnlyGLB(raw){
 const jsonSize=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonSize));
 // CPU validation exercises original mesh, skin, inverse binds and clips. Image
 // decoding and appearance are separately verified in the browser gallery.
 delete doc.images;delete doc.textures;delete doc.samplers;delete doc.extensionsUsed;
 doc.materials=[{}];for(const mesh of doc.meshes)for(const primitive of mesh.primitives)primitive.material=0;
 const binary=raw.subarray(28+jsonSize),json=Buffer.from(JSON.stringify(doc));
 const padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
 const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);
 header.writeUInt32LE(padded.length,12);header.write('JSON',16);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length);binHeader.write('BIN\0',4);
 const result=Buffer.concat([header,padded,binHeader,binary]);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength);
}
