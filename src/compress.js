const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');
const { performance } = require('perf_hooks');

// Directory setup
const rawDir = path.join(__dirname, "..", "raw");
const outputDir = path.join(__dirname, "..", "compressed");

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// We'll use compression ratios rather than quality factors for fair comparison
const targetCompressionRatios = [5, 10, 15, 20, 30, 50];

// Results array to store all results for later analysis
const results = [];

// Main function to compress images
async function compressImages() {
        console.log("Starting compression process...");
        
        // Gets raw file names
        const files = fs.readdirSync(rawDir).filter(file => file.endsWith('.bin')).map(file => file.replace('.bin',''));
        
        console.log(`Found ${files.length} images to process`);

        for (const file of files) {
                const rawPixelDataPath = path.join(rawDir, `${file}.bin`); 
                const metaDataPath = path.join(rawDir, `${file}.json`); 

                if (!fs.existsSync(metaDataPath)) {
                        console.error(`Metadata file not found for ${file}`);
                        continue;
                }

                // Read the metadata
                const metadata = JSON.parse(fs.readFileSync(metaDataPath, 'utf8'));
                const {width, height, bitsAllocated, bitsStored, photometricInterpretation} = metadata;

                // Read the raw Pixel Data
                const rawPixelData = fs.readFileSync(rawPixelDataPath);

                for (const ratio of targetCompressionRatios) {
                        console.log(`Compressing ${file} with target compression ratio ${ratio}:1`);

                        // Create result entry
                        const resultEntry = {
                                filename: file,
                                width,
                                height,
                                bitDepth: bitsAllocated,
                                targetCompressionRatio: ratio,
                                originalSize: rawPixelData.length
                        };

                        // JPEG Compression (convert ratio to quality)
                        const jpegQuality = mapCompressionRatioToJpegQuality(ratio);
                        const jpgCompressedResult = await compressToJpg(file, rawPixelData, width, height, bitsAllocated, jpegQuality);
                        resultEntry.jpeg = jpgCompressedResult;
                        
                        // JPEG2000 Compression
                        const jp2CompressedResult = await compressToJp2(file, rawPixelDataPath, width, height, bitsAllocated, ratio);
                        resultEntry.jp2 = jp2CompressedResult;

                        // High Throughput JPEG 2000 Compression
                        const jphCompressedResult = await compressToJph(file, rawPixelDataPath, width, height, bitsAllocated, ratio);
                        resultEntry.jph = jphCompressedResult;
                        
                        results.push(resultEntry);
                }
        }

        // Write results to JSON file
        fs.writeFileSync(
                path.join(outputDir, "compressionResults.json"),
                JSON.stringify(results, null, 2)
        );
        
        // Generate statistics and plots
        generateStatistics();
}

// Helper function to map compression ratio to JPEG quality
function mapCompressionRatioToJpegQuality(ratio) {
        // Empirical mapping (you may need to adjust based on your specific images)
        // Higher ratio = lower quality
        if (ratio >= 50) return 10;
        if (ratio >= 30) return 25;
        if (ratio >= 20) return 40;
        if (ratio >= 10) return 60;
        if (ratio >= 5) return 80;
        return 90; // For very low compression ratios
}

// Compress to JPEG function
async function compressToJpg(file, rawPixelData, width, height, bitsAllocated, quality, rescaleSlope = 1, rescaleIntercept = -1024, windowCenter = 40, windowWidth = 350) {
    const startTime = performance.now();
    const outputPath = path.join(outputDir, `${file}_q${quality}.jpg`);

    try {
        let inputBuffer;

        if (bitsAllocated > 8) {
            // Interpret the raw buffer as 16-bit unsigned
            const uint16Array = new Uint16Array(rawPixelData.buffer, rawPixelData.byteOffset, rawPixelData.length / 2);
            const uint8Array = new Uint8Array(uint16Array.length);

            // Apply HU conversion and windowing
            const minHU = windowCenter - windowWidth / 2;
            const maxHU = windowCenter + windowWidth / 2;

            for (let i = 0; i < uint16Array.length; i++) {
                // Convert raw pixel to HU
                const hu = (uint16Array[i] * rescaleSlope) + rescaleIntercept;

                // Windowing: map HU to 0–255
                const scaled = ((hu - minHU) / (maxHU - minHU)) * 255;
                uint8Array[i] = Math.max(0, Math.min(255, Math.round(scaled)));
            }

            inputBuffer = Buffer.from(uint8Array);
        } else {
            // If already 8-bit (rare for CT), we could skip or adjust here
            inputBuffer = rawPixelData;
        }

        // Compress using sharp with 1 channel (grayscale)
        await sharp(inputBuffer, {
            raw: {
                width,
                height,
                channels: 1
            }
        })
        .jpeg({ quality })
        .toFile(outputPath);

        const endTime = performance.now();
        const compressedSize = fs.statSync(outputPath).size;
        const actualRatio = rawPixelData.length / compressedSize;

        return {
            compressionTime: endTime - startTime,
            compressedSize,
            compressionRatio: actualRatio,
            quality,
            path: outputPath
        };

    } catch (error) {
        console.error(`Error compressing ${file} to JPEG with quality ${quality}:`, error.message);
        return { error: error.message };
    }
}

// Windowing helper function
function applyWindowingToPixelData(rawPixelData, bitsAllocated, rescaleSlope = 1, rescaleIntercept = -1024, windowCenter = 40, windowWidth = 350) {
    // Interpret the raw buffer as 16-bit unsigned
    const uint16Array = new Uint16Array(rawPixelData.buffer, rawPixelData.byteOffset, rawPixelData.length / 2);
    const processedData = new Uint16Array(uint16Array.length);
    
    // Apply HU conversion and windowing
    const minHU = windowCenter - windowWidth / 2;
    const maxHU = windowCenter + windowWidth / 2;
    
    // For debugging: find actual min/max values
    let minValue = Number.MAX_SAFE_INTEGER;
    let maxValue = 0;
    
    for (let i = 0; i < uint16Array.length; i++) {
        // Convert raw pixel to HU
        const hu = (uint16Array[i] * rescaleSlope) + rescaleIntercept;
        
        // Track min/max values for debugging
        if (uint16Array[i] < minValue) minValue = uint16Array[i];
        if (uint16Array[i] > maxValue) maxValue = uint16Array[i];
        
        // Scale to the full 16-bit range while preserving the windowing
        if (hu <= minHU) {
            processedData[i] = 0;
        } else if (hu >= maxHU) {
            processedData[i] = 65535; // Max for 16-bit
        } else {
            processedData[i] = Math.round(((hu - minHU) / (maxHU - minHU)) * 65535);
        }
    }
    
    console.log(`Raw pixel data range: ${minValue} to ${maxValue}`);
    
    return Buffer.from(processedData.buffer);
}


// Compress to JPEG2000 function

async function compressToJp2(file, rawPixelDataPath, width, height, bitsAllocated, targetRatio, rescaleSlope = 1, rescaleIntercept = -1024, windowCenter = 40, windowWidth = 350) {
    
    const outputPath = path.join(outputDir, `${file}_ratio${targetRatio}.jp2`);
    const tempRawPath = path.join(outputDir, `${file}_temp.pgx`); 
    
    try {
        // Read raw pixel data
        const rawPixelData = fs.readFileSync(rawPixelDataPath);

        const startTime = performance.now();
        
        // Apply windowing to enhance contrast
        const processedData = applyWindowingToPixelData(rawPixelData, bitsAllocated, rescaleSlope, rescaleIntercept, windowCenter, windowWidth);
        
        // Create PGX header with the correct format
        // Format: PG <endianness> <sign> <bit_depth> <width> <height>
        const pgxHeader = Buffer.from(`PG ML + ${bitsAllocated} ${width} ${height}\r\n`, 'ascii');
        fs.writeFileSync(tempRawPath, Buffer.concat([pgxHeader, processedData]));
        
        // Compress using OpenJPEG
        const command = `opj_compress -i "${tempRawPath}" -o "${outputPath}" -p RLCP -t 1024,1024 -c [32,32] -r ${targetRatio}`;
        
        execSync(command);

        // Clean up temporary file
        fs.unlinkSync(tempRawPath);

        const endTime = performance.now();
        const compressedSize = fs.statSync(outputPath).size;
        const actualRatio = rawPixelData.length / compressedSize;

        return {
            compressionTime: endTime - startTime,
            compressedSize,
            compressionRatio: actualRatio,
            targetRatio,
            path: outputPath
        };
    } catch (error) {
        console.error(`Error compressing ${file} to JP2 with ratio ${targetRatio}:`, error);
        return {
            error: error.message
        };
    }
}

// Compress to JPH function

async function compressToJph(file, rawPixelDataPath, width, height, bitsAllocated, targetRatio, rescaleSlope = 1, rescaleIntercept = -1024, windowCenter = 40, windowWidth = 350) {
    
    const outputPath = path.join(outputDir, `${file}_ratio${targetRatio}.jph`);
    const tempRawPath = path.join(outputDir, `${file}_temp.raw`);
    
    try {

        // Read raw pixel data
        const rawPixelData = fs.readFileSync(rawPixelDataPath);
        
        const startTime = performance.now();

        // Apply windowing to enhance contrast
        const processedData = applyWindowingToPixelData(rawPixelData, bitsAllocated, rescaleSlope, rescaleIntercept, windowCenter, windowWidth);
        
        // Write processed data to temp file
        fs.writeFileSync(tempRawPath, processedData);
        
        // Compress using OpenJPH
        const command = `ojph_compress -i "${tempRawPath}" -o "${outputPath}" -dims {${width},${height}} -num_comps 1 -bit_depth ${bitsAllocated} -signed false -downsamp {1,1} -qstep ${1 / targetRatio}`;
        
        execSync(command);
        
        // Clean up temporary file
        fs.unlinkSync(tempRawPath);
        
        const endTime = performance.now();
        const compressedSize = fs.statSync(outputPath).size;
        const actualRatio = rawPixelData.length / compressedSize;
        
        return {
            compressionTime: endTime - startTime,
            compressedSize,
            compressionRatio: actualRatio,
            targetRatio,
            path: outputPath
        };
    } catch (error) {
        console.error(`Error compressing ${file} to JPH with ratio ${targetRatio}:`, error);
        return {
            error: error.message
        };
    }
}

// Generate statistics and plots
function generateStatistics() {
        console.log("Generating statistics...");

        // Group results by target compression ratio
        const byRatio = {};
        targetCompressionRatios.forEach(ratio => {
                byRatio[ratio] = {
                        jpeg: { times: [], sizes: [], ratios: [], qualities: [] },
                        jp2: { times: [], sizes: [], ratios: [] },
                        jph: { times: [], sizes: [], ratios: [] }
                };
        });

        // Collect data
        results.forEach(result => {
                const ratio = result.targetCompressionRatio;
                
                if (result.jpeg && !result.jpeg.error) {
                        byRatio[ratio].jpeg.times.push(result.jpeg.compressionTime);
                        byRatio[ratio].jpeg.sizes.push(result.jpeg.compressedSize);
                        byRatio[ratio].jpeg.ratios.push(result.jpeg.compressionRatio);
                        byRatio[ratio].jpeg.qualities.push(result.jpeg.quality);
                }
                
                if (result.jp2 && !result.jp2.error) {
                        byRatio[ratio].jp2.times.push(result.jp2.compressionTime);
                        byRatio[ratio].jp2.sizes.push(result.jp2.compressedSize);
                        byRatio[ratio].jp2.ratios.push(result.jp2.compressionRatio);
                }
                
                if (result.jph && !result.jph.error) {
                        byRatio[ratio].jph.times.push(result.jph.compressionTime);
                        byRatio[ratio].jph.sizes.push(result.jph.compressedSize);
                        byRatio[ratio].jph.ratios.push(result.jph.compressionRatio);
                }
        });

        // Calculate statistics
        const stats = {};
        targetCompressionRatios.forEach(ratio => {
                stats[ratio] = {
                        jpeg: {
                                avgTime: average(byRatio[ratio].jpeg.times),
                                avgSize: average(byRatio[ratio].jpeg.sizes),
                                avgRatio: average(byRatio[ratio].jpeg.ratios),
                                avgQuality: average(byRatio[ratio].jpeg.qualities)
                        },
                        jp2: {
                                avgTime: average(byRatio[ratio].jp2.times),
                                avgSize: average(byRatio[ratio].jp2.sizes),
                                avgRatio: average(byRatio[ratio].jp2.ratios)
                        },
                        jph: {
                                avgTime: average(byRatio[ratio].jph.times),
                                avgSize: average(byRatio[ratio].jph.sizes),
                                avgRatio: average(byRatio[ratio].jph.ratios)
                        }
                };
        });

        // Write statistics to file
        fs.writeFileSync(
                path.join(outputDir, 'compression_statistics.json'),
                JSON.stringify(stats, null, 2)
        );
        
        // Print summary to console
        console.log('Compression Statistics Summary:');
        console.log('Format | Target Ratio | Actual Ratio | Avg Time (ms) | Avg Size (bytes)');
        console.log('------ | ------------ | ------------ | ------------- | ---------------');
        
        for (const ratio of targetCompressionRatios) {
                if (stats[ratio].jpeg.avgTime) {
                        console.log(`JPEG   | ${ratio}:1 | ${stats[ratio].jpeg.avgRatio.toFixed(2)}:1 | ${stats[ratio].jpeg.avgTime.toFixed(2)} | ${stats[ratio].jpeg.avgSize.toFixed(0)}`);
                }
                
                if (stats[ratio].jp2.avgTime) {
                        console.log(`JP2    | ${ratio}:1 | ${stats[ratio].jp2.avgRatio.toFixed(2)}:1 | ${stats[ratio].jp2.avgTime.toFixed(2)} | ${stats[ratio].jp2.avgSize.toFixed(0)}`);
                }
                
                if (stats[ratio].jph.avgTime) {
                        console.log(`JPH    | ${ratio}:1 | ${stats[ratio].jph.avgRatio.toFixed(2)}:1 | ${stats[ratio].jph.avgTime.toFixed(2)} | ${stats[ratio].jph.avgSize.toFixed(0)}`);
                }
        }
        
        console.log('\nStatistics generated and saved to compression_statistics.json');
}

// Helper function to calculate average
function average(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

// Run the compression
compressImages().catch(err => {
        console.error('Error during compression:', err);
});
