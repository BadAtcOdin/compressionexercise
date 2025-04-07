# Prerequisites

Before running this project, ensure you have the following installed:

- Windows 
- Node.js (v14 or higher)
- npm
- OpenJPEG command-line tools 
- OpenJPH command-line tools (You'll need to compile it yourself so make sure to install Cmake and VS first) 
- RadiAnt to view DICOM files 
- Kakadu demo to view jp2 and jph files
- Dataset. Used www.cancerimagingarchive.net's Rider Pilot dataset (manifest to download dataset is in root folder)

# Installation

1. Clone this repository

git clone https://github.com/yourusername/compression-exercise.git
cd compression-exercise

2. Install Node.js dependencies

npm install

3. Install required npm packages

npm install sharp dicom-parser

4. Ensure OpenJPEG and OpenJPH executables are in your system PATH

# Project Structure
Compression Exercise/
├── dicomImages/          # Original DICOM medical images
├── raw/                  # Extracted raw pixel data and metadata
├── compressed/           # Output directory for compressed images
└── src/
    ├── extract.js        # Script to extract pixel data from DICOM files
    └── compress.js       # Main compression script

# Usage

The process works in two steps:

## 1. Extract raw pixel data from DICOM files

node src/extract.js

This will:
- Process all DICOM files in the `dicomImages` directory
- Extract raw pixel data to binary files in the `raw` directory
- Create accompanying JSON metadata files with image dimensions and bit depth

## 2. Run compression tests

node src/compress.js

This will:
- Process each raw image file
- Compress each image with JPEG, JPEG2000, and HTJ2K formats
- Apply various compression ratios (5:1, 10:1, 15:1, 20:1, 30:1, 50:1)
- Save compressed files to the `compressed` directory
- Generate summary statistics

# Compression Methods

## JPEG

Standard JPEG compression using the Sharp library. Compression ratios are mapped to quality settings using a quality-to-ratio mapping function.

## JPEG2000

Using the OpenJPEG implementation with the command: `opj_compress`. This format provides better quality than standard JPEG at equivalent compression ratios but is slower to process.

## HTJ2K/JPH

High-Throughput JPEG 2000 implementation using OpenJPH with the command: `ojph_compress`. This newer format aims to provide faster encoding/decoding speeds than traditional JPEG2000.

# TODO List

## High Priority
- [ ] Fix HTJ2K CRUTIAL: Current windowing technique doesn't seem to work, investigate and implement proper windowing
- [ ] Implement Web App : create a web app to view images  
- [ ] investigate openjph for progressive image loading : investigate how to decode partial data if server supports low res HTJ2K  

# Results

The results show the performance comparison between the three compression methods:

Compression Statistics Summary:
Format | Target Ratio | Actual Ratio | Avg Time (ms) | Avg Size (bytes)
------ | ------------ | ------------ | ------------- | ----------------
JPEG   | 5:1          | 15.56:1      | 13.54         | 33915
JP2    | 5:1          | 5.00:1       | 285.36        | 104868
JPH    | 5:1          | 35.71:1      | 57.49         | 15262
JPEG   | 10:1         | 21.67:1      | 12.77         | 24315
JP2    | 10:1         | 10.00:1      | 260.64        | 52439
JPH    | 10:1         | 22.32:1      | 58.60         | 24331
JPEG   | 15:1         | 21.67:1      | 12.78         | 24315
JP2    | 15:1         | 14.99:1      | 261.35        | 34965
JPH    | 15:1         | 18.04:1      | 57.30         | 30047
JPEG   | 20:1         | 27.77:1      | 11.96         | 18956
JP2    | 20:1         | 19.99:1      | 250.99        | 26227
JPH    | 20:1         | 15.54:1      | 60.84         | 34852
JPEG   | 30:1         | 36.60:1      | 12.16         | 14363
JP2    | 30:1         | 29.98:1      | 235.39        | 17490
JPH    | 30:1         | 12.73:1      | 62.30         | 42470
JPEG   | 50:1         | 64.54:1      | 11.01         | 8131
JP2    | 50:1         | 49.95:1      | 230.26        | 10496
JPH    | 50:1         | 10.03:1      | 62.94         | 53723

## Key Observations
JPEG2000 is pretty precise but it's the slowest method
JPEG is the fastest method (DCT is faster than WT)
JPEG doesn't achieve the exact ratios, it compresses more than it's asked to, maybe code needs to be tweaked to get the desired ratios
JPH is fast but inconsistent, it has this tendency to get high rates at lowe ratios  Still not reliable when viewed using 3rd party software (Windowing must be adjusted)


- **JPEG**: Fastest but less precise control over compression ratio
- **JP2**: Most precise ratio control but slowest processing
- **JPH**: (for now) Middle ground for speed, but unpredictable ratio control


- JPEG2000 (JP2) achieves the most precise target compression ratios, closely matching the requested ratio values.
- Standard JPEG is the fastest method (lowest compression times) but does not achieve the exact target ratios, often compressing more than requested.
- HTJ2K/JPH shows inconsistent behavior relative to target ratios, with higher compression at lower target ratios and lower compression at higher target ratios.

In a medical context JP2 would be the most reliable since it provides precise size => Quality management.

JPEG is the fastest but it overcompresses and it's lossy. 

HTJ2K Can't really draw conclusions since not properly implemented yet 

