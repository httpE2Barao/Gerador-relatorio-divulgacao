'use client';

import { useState, ChangeEvent, FormEvent } from 'react';

interface ImageItem {
  file: File;
  preview: string;
  title: string;
}

export default function HomePage() {
  const [projectTitle, setProjectTitle] = useState('');
  const [sponsor, setSponsor] = useState('');
  
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');

  const [items, setItems] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);

  const handleCoverImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverImage(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleProofImagesChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        preview: URL.createObjectURL(file),
        title: '',
      }));
      setItems(prevItems => [...prevItems, ...newFiles]);
    }
    e.target.value = '';
  };
  
  const handleTitleChange = (index: number, newTitle: string) => {
    const updatedItems = [...items];
    updatedItems[index].title = newTitle;
    setItems(updatedItems);
  };

  const handleDeleteItem = (index: number) => {
    setItems(prevItems => prevItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!coverImage) {
        alert('Por favor, adicione uma imagem de capa.');
        return;
    }
    if (items.length === 0) {
      alert('Por favor, adicione ao menos uma imagem de comprovação.');
      return;
    }
    setLoading(true);

    const formData = new FormData();
    
    formData.append('projectTitle', projectTitle);
    formData.append('sponsor', sponsor);
    formData.append('coverImage', coverImage);

    items.forEach((item) => {
      formData.append('proof_files', item.file);
      formData.append('titles', item.title);
    });

    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao gerar o PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comprovacao.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    } catch (error: unknown) { // CORREÇÃO 3: 'any' alterado para 'unknown'
      let errorMessage = "Ocorreu um erro desconhecido";
      if (error instanceof Error) {
        errorMessage = `Ocorreu um erro: ${error.message}`;
      }
      console.error(error);
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container mx-auto p-4 md:p-8 bg-white text-black">
      <form onSubmit={handleSubmit}>
        <div className="mb-8 p-6 border border-gray-300 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">1. Dados da Capa</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="mb-4">
                <label className="block text-base font-medium mb-1">Título do Projeto</label>
                <input type="text" value={projectTitle} onChange={e => setProjectTitle(e.target.value)} className="mt-1 block w-full p-2 border border-gray-400 rounded-md shadow-sm focus:border-black focus:ring-black"/>
              </div>
              <div>
                <label className="block text-base font-medium mb-1">Patrocinador</label>
                <input type="text" value={sponsor} onChange={e => setSponsor(e.target.value)} className="mt-1 block w-full p-2 border border-gray-400 rounded-md shadow-sm focus:border-black focus:ring-black"/>
              </div>
            </div>
            <div>
              <label className="block text-base font-medium mb-1">Imagem de Capa</label>
              <input type="file" accept="image/png, image/jpeg" onChange={handleCoverImageChange} className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-200 file:text-black hover:file:bg-gray-300" required/>
              {/* CORREÇÃO 4: Desabilitando aviso do ESLint para a tag img */}
              {coverPreview && <img src={coverPreview} alt="Preview da capa" className="mt-4 rounded-lg w-full object-contain h-32 border border-gray-200"/>}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-bold mb-2">2. Adicionar Imagens de Comprovação</h2>
          <input type="file" multiple accept="image/png, image/jpeg" onChange={handleProofImagesChange} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-200 file:text-black hover:file:bg-gray-300"/>
        </div>

        {items.length > 0 && (
          <div className="mb-6">
             <h3 className="text-xl font-bold mb-2">3. Locais das Imagens</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {items.map((item, index) => (
                <div key={`${item.file.name}-${index}`} className="border border-gray-300 rounded-lg relative flex flex-col">
                  {/* CORREÇÃO 5: Desabilitando aviso do ESLint para a tag img */}
                  <img src={item.preview} alt={`Preview ${index}`} className="w-full h-auto object-cover rounded-t-lg" style={{ aspectRatio: '2/3' }} />
                  <div className="p-2 mt-auto">
                    <input type="text" placeholder="Local" value={item.title} onChange={(e) => handleTitleChange(index, e.target.value)} className="w-full p-1 border border-gray-400 rounded-md shadow-sm focus:border-black focus:ring-black text-sm" required/>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(index)}
                    className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs"
                    aria-label="Deletar imagem"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <button type="submit" disabled={loading || items.length === 0} className="w-full py-3 px-4 bg-black text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed">
            {loading ? 'Gerando PDF...' : 'Gerar PDF de Comprovação'}
        </button>
      </form>
    </main>
  );
}