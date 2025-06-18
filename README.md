# apex-documentation-userscript
This userscript injects documentation into the built in spotlight search in APEX 21.1+. It has only been tested in 24.2.5.

Please note due to the many different hosting options for APEX, the script requests the ability to run on any page with /ords/r/. This may include non-builder pages.

## DISCLAIMER:
This code is unofficial and is not supported by Oracle, the APEX team, or myself. It is provided "as is" without warranty of any kind, either express or implied. Use of this code is at your own risk. The authors and distributors accept no responsibility for any consequences arising from its use.

## Installation:

1. Install Violetmonkey, Tampermonkey, or similar userscript manager
2. Install the userscript via URL: `https://raw.githubusercontent.com/tcaruth/apex-documentation-userscript/refs/heads/main/script.js`
3. Optionally, enable auto updates. The script will update automatically when a new version is released.

## Usage:

1. Open any APEX builder page
2. Click the search bar to open the spotlight search
3. Type your search term, including any PL/SQL package procedure or function
4. Navigate with arrow keys or click on any result to open the documentation in a new tab

## To Do:

- Add support for the javascript apis. Will require different processing to obtain and parse links.
- Find a way to directly pull the PL/SQL TOC from the documentation
