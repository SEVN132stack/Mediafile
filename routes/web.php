<?php

use Illuminate\Support\Facades\Route;

// SPA catch-all - vang alles op behalve api routes
Route::get('/{any}', function () {
    return view('app');
})->where('any', '^(?!api).*$');
