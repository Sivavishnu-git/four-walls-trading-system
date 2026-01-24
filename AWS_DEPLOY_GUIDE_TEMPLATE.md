# Deploying to AWS using CloudFormation

I have created an Infrastructure-as-Code (IaC) template in `aws-infrastructure.yaml`. This template will automatically create:
1.  **S3 Bucket**: To store your website files.
2.  **CloudFront Distribution**: High-speed CDN to serve your site via HTTPS (required for mobile/PWA).
3.  **Security Policies**: Ensures only CloudFront can access your files.

## How to use it

### Option 1: Using AWS Console (Easy)
1.  Login to **AWS Console** > **CloudFormation**.
2.  Click **Create stack** > **With new resources**.
3.  Choose **Upload a template file** and select `aws-infrastructure.yaml` from your project folder.
4.  Click **Next**.
5.  Enter a unique **BucketName** (e.g., `livetrading-app-yourname`).
6.  Click **Next** until the end, then **Submit**.
7.  Wait for the status to change to `CREATE_COMPLETE`.
8.  Go to the **Outputs** tab to see your **WebsiteURL** and **BucketName**.

### Option 2: Using AWS CLI
If you installed the AWS CLI, run this command:
```powershell
aws cloudformation deploy `
  --template-file aws-infrastructure.yaml `
  --stack-name LiveTradingStack `
  --parameter-overrides BucketName=livetrading-app-ragu-001 `
  --capabilities CAPABILITY_IAM
```

## How to Upload Your Code
Once the stack is created:
1.  Build your project:
    ```powershell
    npm run build
    ```
2.  Upload the `dist` folder to the new S3 bucket:
    (Replace `YOUR_BUCKET_NAME` with the one you created)
    ```powershell
    aws s3 sync dist/ s3://YOUR_BUCKET_NAME --delete
    ```

Your app will then be live at the **CloudFront URL** provided in the outputs!
