export function initSettings() {
    const $ = document.querySelector.bind(document);

    const $token = $('#token');
    const $saveToken = $('#save-token');
    
    if (localStorage.getItem('save-token') == '0') {
        $saveToken.checked = false;
    } else if (localStorage.getItem('token')) {
      $token.value = localStorage.getItem('token');
    }
    
    function onSettingsChange() {
        if($saveToken.checked) {
            localStorage.setItem('save-token', '1');
            localStorage.setItem('token', $token.value)
        } else {
            localStorage.setItem('save-token', '0');
            localStorage.removeItem('token');
        }
    }
    
    $token.addEventListener('change', onSettingsChange);
    $saveToken.addEventListener('change', onSettingsChange);
}

