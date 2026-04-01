# Serverless - CSYE 6225

AWS Lambda function for email verification, triggered via SNS.

## Prerequisites
- Node.js 20.x
- AWS CLI configured
- Mailgun account with verified domain

## Build
```bash
npm install
zip -r serverless.zip index.mjs node_modules/ package.json
```

## Deploy
Lambda is deployed via Terraform in the `tf-infra` repository.
The zipped package is referenced by the `aws_lambda_function` resource.