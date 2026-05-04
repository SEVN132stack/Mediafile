<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MediaRequest extends Model
{
    protected $table = 'requests';

    protected $fillable = [
        'tmdb_id', 'media_type', 'title', 'poster_path', 'overview',
        'genre_ids', 'seasons', 'status', 'status_message',
        'radarr_id', 'sonarr_id', 'requested_by',
    ];

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'sending'        => '⏳ Wordt verstuurd',
            'sent'           => '📤 Verstuurd',
            'downloading'    => '⬇️ Downloaden',
            'available'      => '✅ Beschikbaar',
            'failed'         => '❌ Mislukt',
            'not_configured' => '⚠️ Niet geconfigureerd',
            default          => $this->status,
        };
    }
}
