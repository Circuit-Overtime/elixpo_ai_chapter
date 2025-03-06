chrome.commands.onCommand.addListener((shortcut) => {
    if(shortcut == "reload")
    {
        console.log("Reloading the page");
        chrome.runtime.reload();
    }
}) 