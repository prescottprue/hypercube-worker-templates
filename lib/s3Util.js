/** s3 connection helpers
 *	@description functionality for accessing/reading/writing to and from S3. These functions are used by files such as fileStorage.js
 */

var AWS = require('aws-sdk'),
s3Sdk = require('s3'),
q = require('q'),
_ = require('underscore'),
rimraf = require('rimraf');

var sourceS3Conf = new AWS.Config({
  accessKeyId: process.env.HYPERCUBE_AWS_KEY,           //replace this with the S3 Access Key for the source bucket
  secretAccessKey: process.env.HYPERCUBE_AWS_SECRET  //replace this with the S3 Secret Access Key for the source bucket
});
var s3 = new AWS.S3(sourceS3Conf);
var s3Client = s3Sdk.createClient({
	s3Options:{
		accessKeyId: process.env.HYPERCUBE_AWS_KEY,
		secretAccessKey: process.env.HYPERCUBE_AWS_SECRET
	}
});
//Set where local read write ops take place
var localFileStore = "fs/";

/** Create new S3 bucket and set default cors settings, and set index.html is website
 * @function createBucketSite
 * @params {string} newBucketName Name of new bucket to create
 */
exports.createBucketSite = function(bucketName){
	console.log('createBucketSite called');
	var d = q.defer();
	if(bucketName) {
			console.log('[createBucketSite] bucket name:', bucketName);
			createS3Bucket(bucketName).then(function(bucketData){
				console.log('[createBucketSite] createS3Bucket successful:', bucketData);
				setBucketCors(bucketName).then(function(){
					console.log('[createBucketSite] setBucketCors successful. BucketData:', bucketData);
					// d.resolve(bucketData);
					setBucketWebsite(bucketName).then(function(){
						console.log('[createBucketSite] setBucketWebsite successful. BucketData:', bucketData);
						d.resolve(bucketData);
					}, function (err){
						console.error('Error setting bucket site', err);
						d.reject(err);
					});
				}, function (err){
					console.error('Error setting new bucket cors config', err);
					d.reject(err);
				});
			}, function (err){
				console.error('Error creating new bucket', err);
				d.reject(err);
			});
	} else {
		d.reject({status:500, message:'Invalid Bucket Name'});
	}
	return d.promise;
}
/** Delete an S3 Bucket
 * @function createBucketSite
 * @params {string} bucketName Name of new bucket to delete
 */
exports.deleteBucket = function(bucketName){
	return deleteS3Bucket(bucketName);
};

/** Get List of buckets
 * @function getBuckets
 */
exports.getBuckets = function(){
	return getBuckets();
};

/** Save a file to an S3 bucket
 * @function saveFile
 */
exports.saveFile = function(bucketName, fileKey, fileContents){
	return saveToBucket(bucketName, fileKey, fileContents);
};

/** Get list of files within an S3 bucket
 * @function saveFile
 */
exports.getFiles = function(bucketName){
	return getObjects(bucketName);
};

/** Get a signed url
 * @function saveFile
 */
exports.getSignedUrl = function(urlData){
	var d = q.defer();
	var params = {Bucket: urlData.bucket, Key: urlData.key};
	s3.getSignedUrl(urlData.action, params, function (err, url) {
	  if(err){
	  	console.log('Error getting signed url:', err);
	  	d.reject(err);
	  } else {
	  	console.log('The URL is', url);
	  	d.resolve(url);
	  }
	});
	return d.promise;
};
/** Upload a local directory to a bucket
 * @function uploadToBucket
 * @params {string} bucketName Name of bucket to upload to
 * @params {string} bucketName Name of bucket to upload to
 */
exports.uploadDir = uploadDirToBucket;

/** Copy one Bucket to another Bucket including the use of prefixes
 * @function copyBucketToBucket
 * @params {string|object} srcBucketInfo Object with name and prefix or name of bucket to copy as string
 * @params {string} srcBucketInfo.name Name of bucket to copy from
 * @params {string} srcBucketInfo.prefix Prefix of bucket to copy from
 * @params {string|object} destBucketName Object with name and prefix or name of bucket to copy src to
 * @params {string} srcBucketInfo.name Name of bucket to copy to
 * @params {string} srcBucketInfo.prefix Prefix of bucket to copy to
 */
exports.copyBucketToBucket = copyBucketToBucket;


//----------------- Helper Functions ------------------//

/** Get S3 Buckets
 * @function uploadToBucket
 * @params {string} bucketName Name of bucket to upload to
 */
function getBuckets(){
	var d = q.defer();
	s3.listBuckets(function(err, data) {
	  if (err) { console.log("Error:", err); 
		  d.reject(err);
		}
	  else {
	    for (var index in data.Buckets) {
	      var bucket = data.Buckets[index];
	      console.log("Bucket: ", bucket.Name, ' : ', bucket.CreationDate);
	    }
	    d.resolve(data.Buckets);
	  }
	});
	return d.promise;
}
/** Create a new bucket
* @function createS3Bucket
* @params {string} bucketName Name of bucket to create
*/
function createS3Bucket(bucketName){
	console.log('createS3Bucket called', bucketName);
	var newBucketName = bucketName.toLowerCase();
	var d = q.defer();
	// var s3bucket = new AWS.S3();
	// if(AWS.config)
	console.log('AWS config:', AWS.config);
	if(!AWS.config.credentials){
		d.reject(new Error('AWS Credentials are required to access S3'));
	} else {
		s3.createBucket({Bucket: newBucketName, ACL:'public-read'},function(err, data) {
			if(err){
				console.error('[createS3Bucket] error creating bucket:', err);
				d.reject({status:500, error:err});
			} else {
				console.log('[createS3Bucket] bucketCreated successfully:', data);
				// Setup Bucket website
				var dataContents = data.toString();
				// TODO: Return more accurate information here
				d.resolve({name:newBucketName.toLowerCase(), websiteUrl:""});
			}
		});
	}
	return d.promise;
}

/** Remove all contents then delete an S3 bucket
* @function deleteS3Bucket
* @params {string} bucketName Name of bucket to delete
*/
function deleteS3Bucket(bucketName){
	console.log('deleteS3Bucket called', bucketName)
	var d = q.defer();
	// Empty bucket
	var deleteTask = s3Client.deleteDir({Bucket: bucketName});
	deleteTask.on('error', function(err){
		console.error('error deleting bucket:', err);
		d.reject(err);
	});
	deleteTask.on('end', function(){
		console.log(bucketName + ' bucket emptied of files successfully');
		// Delete bucket
		s3.deleteBucket({Bucket: bucketName}, function(err, data) {
			if(err){
				console.error('[deleteS3Bucket()] Error deleting bucket:', err);
				d.reject(err);
			} else {
				// Setup Bucket website
				d.resolve({message: bucketName + ' Bucket deleted successfully'});
			}
		});
	});
	return d.promise;
}
/** Set Cors configuration for an S3 bucket
* @function setBucketCors
* @params {string} newBucketName Name of bucket to set Cors configuration for
*/
//TODO: Set this when creating bucket?
function setBucketCors(bucketName){
	console.log('[setBucketCors()] Bucket Name:', bucketName);
	var d = q.defer();
	s3.putBucketCors({
		Bucket:bucketName,
		CORSConfiguration:{
			CORSRules: [
	      {
	        AllowedHeaders: [
	          '*',
	        ],
	        AllowedMethods: [
	          'HEAD','GET', 'PUT', 'POST'
	        ],
	        AllowedOrigins: [
	          'http://*', 'https://*'
	        ],
	        // ExposeHeaders: [
	        //   'STRING_VALUE',
	        // ],
	        MaxAgeSeconds: 3000
	      },
	    ]
		}
	}, function(err, data){
		if(err){
			console.error('Error creating bucket website setup');
			d.reject({status:500, error:err});
		} else {
			console.log('bucket cors set successfully resolving:');
			d.resolve();
		}
	});
	return d.promise;
}

/** Set website configuration for an S3 bucket
* @function setBucketWebsite
* @params {string} newBucketName Name of bucket for which to set website configuration
*/
function setBucketWebsite(bucketName){
	console.log('[setBucketWebsite()] setBucketWebsite called:', bucketName);
	var d = q.defer();
	s3.putBucketWebsite({
		Bucket: bucketName,
		WebsiteConfiguration:{
			IndexDocument:{
				Suffix:'index.html'
			}
		}
	}, function(err, data){
		if(err){
			console.error('[setBucketWebsite()] Error creating bucket website setup');
			d.reject({status:500, error:err});
		} else {
			console.log('[setBucketWebsite()] website config set for ' + bucketName, data);
			d.resolve();
		}
	});
	return d.promise;
}

/** Upload file contents to S3 given bucket, file key and file contents
 * @function saveToBucket
 * @params {string} bucketName - Name of bucket to upload to
 * @params {object} fileData - Object containing file information
 * @params {string} fileData.key - Key of file to save
 * @params {string} fileData.content - File contents in string form
 */
function saveToBucket(bucketName, fileData){
	console.log('[saveToBucket] saveToBucket called', arguments);
  var d = q.defer();
  var saveParams = {Bucket:bucketName, Key:fileData.key,  Body: fileData.content, ACL:'public-read'};
  if(_.has(fileData, 'contentType')){
  	saveParams.ContentType = fileData.contentType;
  }
  console.log('[saveToBucket] saveParams:', saveParams);
  s3.putObject(saveParams, function(err, data){
  	//[TODO] Add putting object ACL (make public)
    if(!err){
      console.log('[saveToBucket] file saved successfully. Returning:', data);
      d.resolve(data);
    } else {
      console.log('[saveToBucket] error saving file:', err);
      d.reject(err);
    }
  });
  return d.promise;
}
/** Download S3 bucket contetns to provided local directory
 * @function downloadBucketToDir
 * @params {object | string} bucketInfo - Name of bucket to upload files as string 
 * or object containing bucket info as follows: {name:"bucket123", prefix:""}
 * @params {string} localDir - Local directory to upload to S3
 */
function downloadBucketToDir(bucketInfo, localDir){
	console.log('uploadBucketToDir called:', bucketInfo);
	var d = q.defer();
	var bucketName, bucketPrefix = "";
	if(_.isString(bucketInfo)){
		bucketName = bucketInfo;
	} else {
		bucketName = bucketInfo.name;
		if(_.has(bucketInfo, "prefix")){
			bucketPrefix = bucketInfo.prefix;
		}
	}
	var d = q.defer();
	var upParams = {
	  localDir: localDir,
	  s3Params: {
	    Bucket: bucketName,
	    Prefix: bucketPrefix,
	    ACL:'public-read'
	  },
	};
	var downloader = s3Client.downloadDir({localDir:localDir, s3Params:{Prefix:bucketPrefix, Bucket:bucketName}})
	downloader.on('error', function(err) {
  	console.error("[downloadBucketToDir] unable to sync:", err);
  	d.reject(err);
	});
	// downloader.on('progress', function() {
	//   console.log("progress", downloader.progressAmount, downloader.progressTotal);
	// });
	downloader.on('end', function() {
	  console.log("[downloadBucketToDir] Download succesful");
	  d.resolve(localDir);
	});
	return d.promise;
}
/** Upload local directory contents to provided S3 Bucket
 * @function uploadDirToBucket
 * @params {string} bucketName - Name of bucket to upload files to
 * @params {string} localDir - Local directory to upload to S3
 */
function uploadDirToBucket(bucketInfo, localDir){
	console.log('uploadToBucket called:', bucketInfo);
	var d = q.defer();
	var bucketName, bucketPrefix = "";
	if(_.isString(bucketInfo)){
		bucketName = bucketInfo;
	} else {
		bucketName = bucketInfo.name;
		if(_.has(bucketInfo, "prefix")){
			bucketPrefix = bucketInfo.prefix;
		}
	}
	var upParams = {
	  localDir: localDir,
	  s3Params: {
	    Bucket: bucketName,
	    Prefix: bucketPrefix,
	    ACL:'public-read'
	  },
	};
	var uploader = s3Client.uploadDir(upParams);
	uploader.on('error', function(err) {
  	console.error("[uploadToBucket] unable to sync:", err);
  	d.reject(err);
	});
	// uploader.on('progress', function() {
	//   console.log("progress", uploader.progressAmount, uploader.progressTotal);
	// });
	uploader.on('end', function() {
	  console.log("[uploadToBucket] Upload succesful");
		// [TODO] Delete new app folders
	  var bucketUrl = bucketName + '.s3-website-us-east-1.amazonAWS.com';
	  console.log('[uploadToBucket] uploader returning:', bucketUrl);
	  d.resolve(bucketUrl);
	});
	return d.promise;
}
/** Copy one Bucket to another Bucket including the use of prefixes
 * @function copyBucketToBucket
 * @params {string|object} srcBucketInfo Object with name and prefix or name of bucket to copy as string
 * @params {string} srcBucketInfo.name Name of bucket to copy from
 * @params {string} srcBucketInfo.prefix Prefix of bucket to copy from
 * @params {string|object} destBucketName Object with name and prefix or name of bucket to copy src to
 * @params {string} srcBucketInfo.name Name of bucket to copy to
 * @params {string} srcBucketInfo.prefix Prefix of bucket to copy to
 */
 //TODO: Provide the option to delete the local copy or not after operation is complete
function copyBucketToBucket(srcBucketInfo, destBucketInfo){
	console.log('copyBucketToBucket called:', srcBucketInfo, destBucketInfo);
	var srcBucket = {prefix:""};
	var destBucket = {prefix:""};
	//Handle strings and objects
	if(_.isString(srcBucketInfo)){
		srcBucket.name = srcBucketInfo;
	} else {
		srcBucket.name = srcBucketInfo.name;
		if(_.has(srcBucketInfo, "prefix")){
			srcBucket.prefix = srcBucketInfo.prefix;
		}
	}
	if(_.isString(destBucketInfo)){
		destBucket.name = destBucketInfo;
	} else {
		destBucket.name = destBucketInfo.name;
		if(_.has(destBucketInfo, "prefix")){
			destBucket.prefix = destBucketInfo.prefix;
		}
	}
	var d = q.defer();
	var tempFolder = localFileStore + srcBucket.name;
	downloadBucketToDir(srcBucket, tempFolder).then(function(downloadRes){
		console.log('bucket downloaded successfully:', downloadRes);
		uploadDirToBucket(destBucket, tempFolder).then(function(uploadRes){
			console.log('bucket uploaded successfully:', downloadRes);
			rimraf(tempFolder, function(err){
				if(err){console.error('Error removing local directory:', err)}
				d.resolve(destBucket);
			});
		}, function (err){
			console.log('bucket upload error:', err);
			d.reject(err);
		});
	}, function (err){
		console.log('bucket download error:', err);
		d.reject(err);
	});
	return d.promise;
}

/** Insert data into template files
 * @function uploadToBucket
 * @params {array} filesArray List of template files as strings
 * @params {object} templateData Data to be templated into the file
 */
function templateFiles(filesArray, templateData){
	//TODO: Template each file
	// var replaceVar = "ZZ";
	return _.map(filesArray, function(file){
		var template = _.template(fileString);
		return template(templateData);
	});
}

/** Insert data into a local directory of template files
 * @function uploadToBucket
 * @params {array} filesArray
 * @params {object} templateData Data to be templated into the file
 */
function templateLocalDir(dirPath, templateData){
	//TODO: Template each file loaded from path directory
	// var template = _.template(fileString);
	// var compiledFile = template(templateData);
}

//Get list of objects contained within bucket
function getObjects(bucketName){
	var d = q.defer();
	if(!bucketName){
		d.reject({message:'Bucket name required to get objects'});
	}
	s3.listObjects({Bucket:bucketName}, function(err, data) {
	  if (err) { 
	  	console.log("Error:", err);
		  d.reject(err);
		}
	  else {
	  	console.log("[getObjects] listObjects returned:", data);
	    d.resolve(data);
	  }
	});
	return d.promise;
}
