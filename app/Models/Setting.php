<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['key', 'value'];

    public static array $keys = [
        'tmdb_api_key', 'jellyfin_url', 'jellyfin_api_key',
        'plex_url', 'plex_token', 'radarr_url', 'radarr_api_key',
        'radarr_quality_profile', 'radarr_root_folder',
        'sonarr_url', 'sonarr_api_key', 'sonarr_quality_profile', 'sonarr_root_folder',
    ];

    public static function get(string $key): string
    {
        return static::where('key', $key)->value('value') ?? env(strtoupper($key), '');
    }

    public static function set(string $key, string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }

    public static function getAll(): array
    {
        $rows = parent::query()->get();
        $result = [];
        foreach ($rows as $row) {
            $result[$row->key] = $row->value;
        }
        return $result;
    }
}
