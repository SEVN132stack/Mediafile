<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->unique();
            $table->string('display_name')->nullable();
            $table->string('password');
            $table->enum('role', ['admin', 'user'])->default('user');
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('requests', function (Blueprint $table) {
            $table->id();
            $table->integer('tmdb_id');
            $table->enum('media_type', ['movie', 'tv']);
            $table->string('title');
            $table->string('poster_path')->nullable();
            $table->text('overview')->nullable();
            $table->string('genre_ids')->default('');
            $table->string('seasons')->default('');
            $table->enum('status', ['sending', 'sent', 'downloading', 'available', 'failed', 'not_configured'])->default('sending');
            $table->string('status_message')->default('');
            $table->integer('radarr_id')->nullable();
            $table->integer('sonarr_id')->nullable();
            $table->string('requested_by');
            $table->timestamps();

            $table->unique(['tmdb_id', 'media_type']);
        });

        Schema::create('settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->text('value')->default('');
            $table->timestamps();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('settings');
        Schema::dropIfExists('requests');
        Schema::dropIfExists('users');
    }
};
