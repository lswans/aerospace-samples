#!/usr/bin/env bash
# Deploys the API (SAM) and the page (Amplify manual deploy). Run from your own terminal.
# Needs: aws CLI logged in, sam CLI, zip, python3. Region us-east-1 (where rocket-test-fire lives).
set -euo pipefail
R=us-east-1
STACK=rocket-demo-api
APPNAME=rocket-test-stand
cd "$(dirname "$0")"

echo "== 1/3 API"
sam build -q
sam deploy -q --stack-name $STACK --region $R --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset --no-fail-on-empty-changeset
API=$(aws cloudformation describe-stacks --stack-name $STACK --region $R --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
echo "window.ROCKET_API_URL = \"$API\";" > site/config.js
echo "API: $API"

echo "== 2/3 Amplify app"
APP=$(aws amplify list-apps --region $R --query "apps[?name=='$APPNAME'].appId" --output text)
if [ -z "$APP" ]; then
  APP=$(aws amplify create-app --name $APPNAME --region $R --query app.appId --output text)
  aws amplify create-branch --app-id $APP --branch-name main --region $R >/dev/null
fi
rm -f site.zip && (cd site && zip -qr ../site.zip .)
OUT=$(aws amplify create-deployment --app-id $APP --branch-name main --region $R --output json)
JOB=$(echo "$OUT" | python3 -c "import json,sys;print(json.load(sys.stdin)['jobId'])")
URL=$(echo "$OUT" | python3 -c "import json,sys;print(json.load(sys.stdin)['zipUploadUrl'])")
curl -s -X PUT -H "Content-Type: application/zip" -T site.zip "$URL" -o /dev/null -w "upload %{http_code}\n"
aws amplify start-deployment --app-id $APP --branch-name main --job-id $JOB --region $R >/dev/null
SITE="https://main.$APP.amplifyapp.com"
echo "Site: $SITE"

echo "== 3/3 lock CORS to the site origin"
sam deploy -q --stack-name $STACK --region $R --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset --no-fail-on-empty-changeset --parameter-overrides AllowOrigin=$SITE
echo "Done. Open $SITE and press Initiate Burn."
echo "Teardown: aws cloudformation delete-stack --stack-name $STACK --region $R ; aws amplify delete-app --app-id $APP --region $R"
