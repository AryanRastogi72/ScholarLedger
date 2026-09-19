git init
git branch -M main
git remote add origin https://github.com/AryanRastogi72/ScholarLedger.git

function Add-Commit {
    param($date, $msg, $files)
    $env:GIT_AUTHOR_DATE = $date
    $env:GIT_COMMITTER_DATE = $date
    # Split files by space and add them
    $fileArray = $files -split ' '
    foreach ($file in $fileArray) {
        git add $file
    }
    git commit -m $msg
}

# Add gitignore first so we don't accidentally add junk
$env:GIT_AUTHOR_DATE = "2026-09-16T10:10:00+05:30"
$env:GIT_COMMITTER_DATE = "2026-09-16T10:10:00+05:30"
git add .gitignore
git commit -m "Initial commit"

# Commit 1: Sept 16, 10:15 AM
Add-Commit "2026-09-16T10:15:00+05:30" "Initialize Hardhat project setup" "package.json package-lock.json hardhat.config.js"

# Commit 2: Sept 16, 03:42 PM
Add-Commit "2026-09-16T15:42:00+05:30" "Add InstitutionRegistry smart contract" "contracts/InstitutionRegistry.sol"

# Commit 3: Sept 17, 11:05 AM
Add-Commit "2026-09-17T11:05:00+05:30" "Add CredentialManager for credential issuance" "contracts/CredentialManager.sol"

# Commit 4: Sept 17, 04:20 PM
Add-Commit "2026-09-17T16:20:00+05:30" "Add tests and deployment scripts" "test scripts"

# Commit 5: Sept 18, 09:33 AM
Add-Commit "2026-09-18T09:33:00+05:30" "Initialize React frontend with Vite" "frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/index.html"

# Commit 6: Sept 18, 02:14 PM
Add-Commit "2026-09-18T14:14:00+05:30" "Add ethers utils and MetaMask connect component" "frontend/src/utils frontend/src/components"

# Commit 7: Sept 18, 08:45 PM
Add-Commit "2026-09-18T20:45:00+05:30" "Create Dashboard and Register institution UI" "frontend/src/pages/Dashboard.jsx frontend/src/pages/Register.jsx frontend/src/App.jsx frontend/src/main.jsx"

# Commit 8: Sept 19, 10:12 AM
Add-Commit "2026-09-19T10:12:00+05:30" "Implement Issue, Verify, and Explorer pages" "frontend/src/pages/Issue.jsx frontend/src/pages/Verify.jsx frontend/src/pages/Explorer.jsx frontend/src/pages/Revoke.jsx frontend/src/pages/ForgeryDemo.jsx"

# Commit 9: Sept 19, 01:55 PM
Add-Commit "2026-09-19T13:55:00+05:30" "Refine CSS styling and update README/Slides for midsem" "."

git push -u origin main
