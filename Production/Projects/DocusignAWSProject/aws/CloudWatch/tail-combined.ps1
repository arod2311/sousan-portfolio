param(
  [string]$Profile = "lambda-admin",
  [string]$Region  = "us-east-1",
  [string]$OutDir  = "C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Projects\DocusignAWSProject\aws\CloudWatch"
)

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$log = Join-Path $OutDir ("combined-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

$worker = {
  param($Group,$Label,$Profile,$Region,$LogFile)
  aws logs tail $Group --follow --format detailed --profile $Profile --region $Region |
    ForEach-Object {
      $line = "[" + $Label + "] " + $_
      $line | Tee-Object -FilePath $LogFile -Append
    }
}

$j1 = Start-Job -ScriptBlock $worker -ArgumentList "/aws/lambda/WelcomeEmailHandler","WELCOME",$Profile,$Region,$log
$j2 = Start-Job -ScriptBlock $worker -ArgumentList "/aws/lambda/DocuSignConnectHandler","CONNECT",$Profile,$Region,$log

Write-Host ("Writing combined logs to " + $log)
# Wait for both jobs to complete, then receive their output and keep it in the job store
Wait-Job -Job $j1,$j2 | Out-Null
Receive-Job -Job $j1,$j2 -Keep
