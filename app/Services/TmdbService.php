<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

class TmdbService
{
    private string $base = 'https://api.themoviedb.org/3';
    private string $lang = 'nl-NL';

    private function key(): string
    {
        $k = Setting::get('tmdb_api_key');
        if (!$k) throw new \Exception('TMDB API key niet ingesteld');
        return $k;
    }

    public function get(string $endpoint, array $params = []): array
    {
        $response = Http::timeout(10)->get("{$this->base}{$endpoint}", array_merge([
            'api_key'  => $this->key(),
            'language' => $this->lang,
        ], $params));

        if (!$response->ok()) throw new \Exception("TMDB {$response->status()}");
        return $response->json();
    }

    public function search(string $query, int $page = 1): array   { return $this->get('/search/multi', compact('query', 'page')); }
    public function trending(string $type, int $page = 1): array  { return $this->get("/trending/{$type}/week", compact('page')); }
    public function genres(string $type): array                   { return $this->get("/genre/{$type}/list"); }
    public function discover(string $type, array $p = []): array  { return $this->get("/discover/{$type}", $p); }
    public function collection(string $endpoint, int $page=1): array { return $this->get($endpoint, compact('page')); }
    public function person(int $id): array                        { return $this->get("/person/{$id}", ['append_to_response' => 'combined_credits']); }
    public function upcoming(int $page = 1): array                { return $this->get('/movie/upcoming', ['page' => $page, 'region' => 'NL']); }
    public function tmdbCollection(int $id): array                { return $this->get("/collection/{$id}"); }

    public function details(string $type, int $id): array
    {
        return $this->get("/{$type}/{$id}", [
            'append_to_response'    => 'credits,recommendations,videos',
            'include_video_language' => 'nl,en,null',
        ]);
    }

    public function externalIds(string $type, int $id): array { return $this->get("/{$type}/{$id}/external_ids"); }
}
