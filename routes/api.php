<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\RequestController;
use App\Http\Controllers\SettingController;
use App\Http\Middleware\AdminMiddleware;
use Illuminate\Support\Facades\Route;

// Auth (geen token nodig)
Route::get('/auth/status',  [AuthController::class, 'status']);
Route::post('/auth/setup',  [AuthController::class, 'setup']);
Route::post('/auth/login',  [AuthController::class, 'login']);

// Beveiligde routes
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me',      [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Media
    Route::get('/search',                         [MediaController::class, 'search']);
    Route::get('/trending/{type}',                [MediaController::class, 'trending']);
    Route::get('/genres/{type}',                  [MediaController::class, 'genres']);
    Route::get('/discover/{type}',                [MediaController::class, 'discover']);
    Route::get('/collection/{type}/{collection}', [MediaController::class, 'collection']);
    Route::get('/details/{type}/{id}',            [MediaController::class, 'details']);
    Route::get('/upcoming',                       [MediaController::class, 'upcoming']);
    Route::get('/person/{id}',                    [MediaController::class, 'person']);
    Route::get('/tmdb-collection/{id}',           [MediaController::class, 'tmdbCollection']);
    Route::get('/recommendations',                [MediaController::class, 'recommendations']);
    Route::get('/requests/statusmap',             [MediaController::class, 'statusMap']);

    // Requests
    Route::get('/requests',              [RequestController::class, 'index']);
    Route::post('/requests',             [RequestController::class, 'store']);
    Route::post('/requests/{id}/retry',  [RequestController::class, 'retry']);
    Route::delete('/requests/{id}',      [RequestController::class, 'destroy']);

    // Admin only
    Route::middleware(AdminMiddleware::class)->group(function () {
        Route::get('/settings',                 [SettingController::class, 'index']);
        Route::put('/settings',                 [SettingController::class, 'update']);
        Route::post('/settings/test',           [SettingController::class, 'test']);
        Route::get('/settings/radarr-profiles', [SettingController::class, 'radarrProfiles']);
        Route::get('/settings/sonarr-profiles', [SettingController::class, 'sonarrProfiles']);
        Route::get('/users',                    [SettingController::class, 'users']);
        Route::post('/users',                   [SettingController::class, 'createUser']);
        Route::delete('/users/{id}',            [SettingController::class, 'deleteUser']);
    });
});
