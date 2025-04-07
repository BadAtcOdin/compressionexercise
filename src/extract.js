const dicomParser = require('dicom-parser');
const { Buffer } = require('node:buffer');
const fs = require("fs");
const path = require("path");


// Folders' path setup 
const dicomDir = path.join(__dirname,"..","dicomImages");
const rawDir = path.join(__dirname, "..","raw");


function extractPixelData(){
    // Get DICOM files
    const files = fs.readdirSync(dicomDir).filter(file => file.endsWith(".dcm"));
    // console.log(`Loaded ${files.length} DICOM files`);

    // Loop through each file and extract pixel data 
    
    for (const file of files){
        try {
            const filepath = path.join(dicomDir, file);
            // read file 
            const dicomFileAsBuffer = fs.readFileSync(filepath);
            // parse file
            const dataSet = dicomParser.parseDicom(dicomFileAsBuffer);
            // Get pixel data element     
            const pixelData = dataSet.elements.x7fe00010;
            // Get pixel data
            const pixelDataBuffer = dicomParser.sharedCopy(dicomFileAsBuffer, pixelData.dataOffset, pixelData.length);
            
            // Save Pixel Data to raw folder
            const rawPixelDataPath = path.join(rawDir, file.replace(".dcm", ".bin"));
            
            
            fs.writeFileSync(rawPixelDataPath, pixelDataBuffer);

            // Get metadata (width, height bits (allocated and stored)
            const width = dataSet.uint16('x00280011'); // Get the width of the image
            const height = dataSet.uint16('x00280010'); // Get the height of the image
            const bitsAllocated = dataSet.uint16('x00280100'); // Get the bits allocated
            const bitsStored = dataSet.uint16('x00280101'); // Get the bits stored
            const photometricInterpretation = dataSet.string('x00280004'); // Get the photometric interpretation  in the case of the current dataset 
        
            // debug bitsAllocated and bitsStored
            if (bitsAllocated !== 16 || bitsStored !== 16) {
                console.error(`Unexpected bit depth: bitsAllocated=${bitsAllocated}, bitsStored=${bitsStored}`);
            }

            // Save Metadata to raw folder

            const metaDataPath = path.join(rawDir, file.replace(".dcm", ".json"));

            fs.writeFileSync(metaDataPath, JSON.stringify({
                width,
                height,
                bitsAllocated,
                bitsStored,
                photometricInterpretation
            }, null, 2));

            
            // console.log(`Pixel Data for ${file}:`);
            // console.log(pixelData);
            // console.log(`Width: ${width}`);
            // console.log(`Height: ${height}`);
            // console.log(`Bits Allocated: ${bitsAllocated}`);
            // console.log(`Bits Stored: ${bitsStored}`);
            // console.log(`Photometric Interpretation: ${photometricInterpretation}`);
            

        }

        catch (error) {
            console.error(`Error processing file ${file}:`, error.message);
        }
    }
    
    
}

extractPixelData();


