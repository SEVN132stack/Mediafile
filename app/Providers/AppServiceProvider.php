<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Filesystem\Filesystem;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Registreer 'files' binding die Sanctum nodig heeft
        $this->app->singleton('files', function () {
            return new Filesystem;
        });
    }

    public function boot(): void {}
}
